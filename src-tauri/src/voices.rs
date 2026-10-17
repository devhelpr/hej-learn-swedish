use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
use tokio::sync::watch;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSpec {
    pub size: u64,
    pub sha256: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Speaker {
    pub id: String,
    pub name: String,
    pub speaker: u32,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub id: String,
    pub name: String,
    pub version: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub files: BTreeMap<String, FileSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub voices: Vec<Speaker>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableVoice {
    #[serde(flatten)]
    pub package: Package,
    pub installed: bool,
    pub downloading: bool,
    pub voice_id: String,
    pub voice_count: usize,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    downloaded: u64,
    total: u64,
}

#[derive(Default)]
pub struct Downloads(Arc<Mutex<BTreeMap<String, watch::Sender<bool>>>>);
struct Lease {
    downloads: Arc<Mutex<BTreeMap<String, watch::Sender<bool>>>>,
    id: String,
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut map) = self.downloads.lock() {
            map.remove(&self.id);
        }
    }
}
impl Downloads {
    fn begin(&self, id: &str) -> Result<(Lease, watch::Receiver<bool>), String> {
        let mut map = self.0.lock().map_err(|e| e.to_string())?;
        if map.contains_key(id) {
            return Err("Deze stem wordt al gedownload.".into());
        }
        let (tx, rx) = watch::channel(false);
        map.insert(id.into(), tx);
        Ok((
            Lease {
                downloads: self.0.clone(),
                id: id.into(),
            },
            rx,
        ))
    }
    pub fn cancel(&self, id: &str) {
        if let Ok(map) = self.0.lock() {
            if let Some(tx) = map.get(id) {
                let _ = tx.send(true);
            }
        }
    }
    pub fn shutdown(&self) {
        if let Ok(map) = self.0.lock() {
            for tx in map.values() {
                let _ = tx.send(true);
            }
        }
    }
}
fn catalog() -> Vec<Package> {
    serde_json::from_str(include_str!("../voice-catalog.json"))
        .expect("valid bundled voice catalog")
}
fn package(id: &str) -> Result<Package, String> {
    catalog()
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Onbekende downloadbare stem.".into())
}
pub fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("voices"))
        .map_err(|e| e.to_string())
}
fn folder(root: &Path, p: &Package) -> PathBuf {
    root.join(format!(
        "{}-{}",
        p.id.trim_start_matches("local:"),
        p.version
    ))
}
fn hash_file(path: &Path) -> Result<(u64, String), String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut count = 0;
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        count += n as u64;
        hash.update(&buffer[..n]);
    }
    Ok((count, format!("{:x}", hash.finalize())))
}
fn installed(root: &Path, p: &Package) -> bool {
    let dir = folder(root, p);
    dir.join("installed.json").is_file()
        && p.files.iter().all(|(name, spec)| {
            hash_file(&dir.join(name))
                .is_ok_and(|(size, hash)| size == spec.size && hash == spec.sha256)
        })
}
pub async fn list(
    app: &tauri::AppHandle,
    downloads: &Downloads,
) -> Result<Vec<AvailableVoice>, String> {
    if !cfg!(windows) {
        return Ok(Vec::new());
    }
    let root = root(app)?;
    let busy = downloads
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    tokio::task::spawn_blocking(move || {
        catalog()
            .into_iter()
            .map(|p| AvailableVoice {
                installed: installed(&root, &p),
                downloading: busy.contains(&p.id),
                voice_id: p
                    .voices
                    .first()
                    .map(|v| v.id.clone())
                    .unwrap_or_else(|| p.id.clone()),
                voice_count: p.voices.len().max(1),
                package: p,
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

fn unpack(
    archive: &Path,
    stage: &Path,
    p: &Package,
    cancel: &watch::Receiver<bool>,
) -> Result<(), String> {
    let (size, hash) = hash_file(archive)?;
    if size != p.size || hash != p.sha256 {
        return Err("De download is beschadigd. Probeer opnieuw.".into());
    }
    let mut zip = zip::ZipArchive::new(fs::File::open(archive).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if zip.len() != p.files.len() {
        return Err("Onjuist stempakket.".into());
    }
    let mut seen = std::collections::HashSet::new();
    for i in 0..zip.len() {
        if *cancel.borrow() {
            return Err("Download geannuleerd.".into());
        }
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_owned();
        let spec = p
            .files
            .get(&name)
            .ok_or("Onverwacht bestand in stempakket.")?;
        if name.contains(['/', '\\']) || !seen.insert(name.clone()) || entry.size() != spec.size {
            return Err("Onjuist bestand in stempakket.".into());
        }
        let dest = stage.join(&name);
        let mut output = fs::File::create(&dest).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        let mut count = 0;
        loop {
            if *cancel.borrow() {
                return Err("Download geannuleerd.".into());
            }
            let n = entry.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > spec.size {
                return Err("Stembestand is te groot.".into());
            }
            hash.update(&buffer[..n]);
            output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        output.sync_all().map_err(|e| e.to_string())?;
        if count != spec.size || format!("{:x}", hash.finalize()) != spec.sha256 {
            return Err("Stembestand is beschadigd.".into());
        }
    }
    fs::write(
        stage.join("installed.json"),
        serde_json::to_vec(p).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn commit(stage: &Path, root: &Path, p: &Package) -> Result<(), String> {
    let destination = folder(root, p);
    let backup = root.join(format!(".old-{}", uuid::Uuid::new_v4()));
    let replacing = destination.exists();
    if replacing {
        fs::rename(&destination, &backup).map_err(|_| {
            "Stem is nog in gebruik. Stop het afspelen en probeer opnieuw.".to_string()
        })?;
    }
    if let Err(e) = fs::rename(stage, &destination) {
        if replacing {
            let _ = fs::rename(&backup, &destination);
        }
        return Err(e.to_string());
    }
    if replacing {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(())
}
async fn download_archive(
    client: &reqwest::Client,
    p: &Package,
    archive: &Path,
    cancel: &mut watch::Receiver<bool>,
    progress: impl Fn(u64) + Send,
) -> Result<(), String> {
    if *cancel.borrow() {
        return Err("Download geannuleerd.".into());
    }
    let request = client.get(&p.url).send();
    let mut response = tokio::select! {
        result = request => result.map_err(|_| "Download kon niet starten. Controleer je internetverbinding en probeer opnieuw.".to_string())?.error_for_status().map_err(|_| "Stempakket is nog niet beschikbaar. Probeer later opnieuw.".to_string())?,
        _ = cancel.changed() => return Err("Download geannuleerd.".into()),
    };
    let mut output = tokio::fs::File::create(&archive)
        .await
        .map_err(|e| e.to_string())?;
    let mut downloaded = 0;
    let mut last_emit = std::time::Instant::now();
    loop {
        let chunk = tokio::select! { result = response.chunk() => result.map_err(|_| "Download onderbroken. Probeer opnieuw.".to_string())?, _ = cancel.changed() => return Err("Download geannuleerd.".into()) };
        let Some(chunk) = chunk else {
            break;
        };
        downloaded += chunk.len() as u64;
        if downloaded > p.size {
            return Err("Stempakket is te groot.".into());
        }
        tokio::io::AsyncWriteExt::write_all(&mut output, &chunk)
            .await
            .map_err(|e| e.to_string())?;
        if last_emit.elapsed() >= std::time::Duration::from_millis(100) || downloaded == p.size {
            progress(downloaded);
            last_emit = std::time::Instant::now();
        }
    }
    output.sync_all().await.map_err(|e| e.to_string())?;
    drop(output);
    Ok(())
}

pub async fn install(
    app: &tauri::AppHandle,
    downloads: &Downloads,
    id: &str,
) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Downloadbare stemmen zijn beschikbaar op Windows.".into());
    }
    let p = package(id)?;
    let (_lease, mut cancel) = downloads.begin(id)?;
    let root = root(app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let workspace = tempfile::Builder::new()
        .prefix(".download-")
        .tempdir_in(&root)
        .map_err(|e| e.to_string())?;
    let archive = workspace.path().join("voice.zip");
    let client = reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    download_archive(&client, &p, &archive, &mut cancel, |downloaded| {
        let _ = app.emit(
            "voice-download",
            Progress {
                id: id.into(),
                downloaded,
                total: p.size,
            },
        );
    })
    .await?;
    tokio::task::spawn_blocking(move || {
        let stage = workspace.path().join("unpacked");
        fs::create_dir(&stage).map_err(|e| e.to_string())?;
        unpack(&archive, &stage, &p, &cancel)?;
        if *cancel.borrow() {
            return Err("Download geannuleerd.".into());
        }
        commit(&stage, &root, &p)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path) -> (Package, PathBuf) {
        let path = root.join("voice.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        zip.start_file(
            "model.onnx",
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored),
        )
        .unwrap();
        zip.write_all(b"voice").unwrap();
        zip.finish().unwrap();
        let (size, sha256) = hash_file(&path).unwrap();
        let p = Package {
            id: "local:test".into(),
            name: "Test".into(),
            engine: None,
            voices: vec![],
            version: "1".into(),
            url: "https://example.invalid".into(),
            size,
            sha256,
            files: BTreeMap::from([(
                "model.onnx".into(),
                FileSpec {
                    size: 5,
                    sha256: format!("{:x}", Sha256::digest(b"voice")),
                },
            )]),
        };
        (p, path)
    }
    #[test]
    fn install_verify_repair_and_ignore_partial() {
        let dir = tempfile::tempdir().unwrap();
        let (p, path) = fixture(dir.path());
        let stage = dir.path().join("stage");
        fs::create_dir(&stage).unwrap();
        let (_tx, rx) = watch::channel(false);
        assert!(!installed(dir.path(), &p));
        unpack(&path, &stage, &p, &rx).unwrap();
        commit(&stage, dir.path(), &p).unwrap();
        assert!(installed(dir.path(), &p));
        fs::write(folder(dir.path(), &p).join("model.onnx"), b"wrong").unwrap();
        assert!(!installed(dir.path(), &p));
        fs::create_dir(&stage).unwrap();
        unpack(&path, &stage, &p, &rx).unwrap();
        commit(&stage, dir.path(), &p).unwrap();
        assert!(installed(dir.path(), &p));
    }
    #[test]
    fn bad_checksum_cancel_duplicate_retry() {
        let dir = tempfile::tempdir().unwrap();
        let (mut p, path) = fixture(dir.path());
        let stage = dir.path().join("stage");
        fs::create_dir(&stage).unwrap();
        let downloads = Downloads::default();
        let (lease, rx) = downloads.begin(&p.id).unwrap();
        assert!(downloads.begin(&p.id).is_err());
        downloads.cancel(&p.id);
        assert!(unpack(&path, &stage, &p, &rx)
            .unwrap_err()
            .contains("geannuleerd"));
        drop(lease);
        let (_lease, rx) = downloads.begin(&p.id).unwrap();
        p.sha256 = "bad".into();
        assert!(unpack(&path, &stage, &p, &rx)
            .unwrap_err()
            .contains("beschadigd"));
        assert!(package("../../other").is_err());
    }
    #[test]
    fn catalog_is_pinned_and_complete() {
        let entries = catalog();
        assert_eq!(entries.len(), 3);
        for p in entries {
            assert_eq!(p.sha256.len(), 64);
            assert!(p.size > 60_000_000);
            assert!(p.url.contains("/speech-models-v1/"));
            let required = if p.engine.as_deref() == Some("supertonic") {
                assert_eq!(p.voices.len(), 10);
                for (i, voice) in p.voices.iter().enumerate() {
                    assert_eq!(voice.id, format!("local:supertonic:{i}"));
                    assert_eq!(voice.speaker, i as u32);
                }
                vec![
                    "duration_predictor.int8.onnx",
                    "text_encoder.int8.onnx",
                    "vector_estimator.int8.onnx",
                    "vocoder.int8.onnx",
                    "tts.json",
                    "unicode_indexer.bin",
                    "voice.bin",
                    "CODE-LICENSE.txt",
                ]
            } else {
                assert!(p.voices.is_empty());
                vec!["model.onnx", "config.json", "tokens.txt"]
            };
            for name in required.into_iter().chain(["NOTICE.txt", "LICENSE.txt"]) {
                assert!(p.files.contains_key(name));
            }
        }
    }
    #[tokio::test]
    async fn transport_success_short_response_oversize_and_cancel() {
        // Exercise the same transport used by install, against a local fake asset server.
        fn serve(body: &'static [u8]) -> String {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let mut buffer = [0u8; 1024];
                let _ = socket.read(&mut buffer);
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                socket.write_all(header.as_bytes()).unwrap();
                socket.write_all(body).unwrap();
            });
            format!("http://{address}/voice.zip")
        }
        let dir = tempfile::tempdir().unwrap();
        let (mut p, _) = fixture(dir.path());
        let client = reqwest::Client::new();
        let (_tx, mut rx) = watch::channel(false);
        p.size = 5;
        p.url = serve(b"voice");
        let archive = dir.path().join("download.zip");
        download_archive(&client, &p, &archive, &mut rx, |_| {})
            .await
            .unwrap();
        assert_eq!(fs::read(&archive).unwrap(), b"voice");
        p.url = serve(b"shorter than expected");
        p.size = 100;
        download_archive(&client, &p, &archive, &mut rx, |_| {})
            .await
            .unwrap();
        let stage = dir.path().join("stage");
        fs::create_dir(&stage).unwrap();
        assert!(unpack(&archive, &stage, &p, &rx).is_err());
        p.url = serve(b"too big");
        p.size = 3;
        assert!(download_archive(&client, &p, &archive, &mut rx, |_| {})
            .await
            .unwrap_err()
            .contains("te groot"));
        let (tx, mut rx) = watch::channel(false);
        tx.send(true).unwrap();
        assert!(download_archive(&client, &p, &archive, &mut rx, |_| {})
            .await
            .unwrap_err()
            .contains("geannuleerd"));
    }
    #[test]
    fn failed_replacement_restores_existing_voice_and_bad_file_hash_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (mut p, path) = fixture(dir.path());
        let stage = dir.path().join("stage");
        fs::create_dir(&stage).unwrap();
        let (_tx, rx) = watch::channel(false);
        unpack(&path, &stage, &p, &rx).unwrap();
        commit(&stage, dir.path(), &p).unwrap();
        assert!(commit(&stage, dir.path(), &p).is_err());
        assert!(installed(dir.path(), &p));
        fs::create_dir(&stage).unwrap();
        p.files.get_mut("model.onnx").unwrap().sha256 = "bad".into();
        assert!(unpack(&path, &stage, &p, &rx)
            .unwrap_err()
            .contains("beschadigd"));
    }
}
