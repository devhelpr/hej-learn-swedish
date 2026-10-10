use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::Emitter;
use tokio::sync::oneshot;
type Pending = Arc<Mutex<std::collections::HashMap<String, oneshot::Sender<Value>>>>;
pub struct Speech {
    process: Mutex<Option<(Child, ChildStdin)>>,
    pending: Pending,
}
impl Speech {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            pending: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }
    fn send(&self, app: &tauri::AppHandle, value: Value) -> Result<(), String> {
        let mut state = self.process.lock().map_err(|e| e.to_string())?;
        if let Some((child, _)) = state.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                *state = None;
            }
        }
        if state.is_none() {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let name = if cfg!(windows) {
                "speech-helper.exe"
            } else {
                "speech-helper"
            };
            let packaged = exe.parent().unwrap().join(name);
            let helper = if packaged.is_file() {
                packaged
            } else {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("binaries")
                    .join(format!(
                        "speech-helper-{}{}",
                        env!("HELPER_TARGET"),
                        if cfg!(windows) { ".exe" } else { "" }
                    ))
            };
            let mut child=Command::new(helper).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_|"De native spraakhulp kon niet starten. Herinstalleer de app of voer npm run native uit.".to_string())?;
            let stdout = child.stdout.take().unwrap();
            let stdin = child.stdin.take().unwrap();
            let app = app.clone();
            let pending = self.pending.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Ok(v) = serde_json::from_str::<Value>(&line) {
                        if v["kind"] == "voices" {
                            if let Some(id) = v["id"].as_str() {
                                if let Ok(mut p) = pending.lock() {
                                    if let Some(tx) = p.remove(id) {
                                        let _ = tx.send(v);
                                    }
                                }
                            }
                        } else {
                            let _ = app.emit("speech", v);
                        }
                    }
                }
                if let Ok(mut p) = pending.lock() {
                    p.clear();
                }
                let _=app.emit("speech",json!({"kind":"error","id":"","message":"De spraakhulp is gestopt. Probeer opnieuw."}));
            });
            *state = Some((child, stdin));
        }
        let (_, stdin) = state.as_mut().unwrap();
        writeln!(stdin, "{}", value)
            .and_then(|_| stdin.flush())
            .map_err(|_| "De spraakhulp reageert niet.".to_string())
    }
    pub async fn voices(&self, app: &tauri::AppHandle) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), tx);
        if let Err(e) = self.send(app, json!({"action":"voices","id":id})) {
            self.pending.lock().unwrap().remove(&id);
            return Err(e);
        }
        let response = tokio::time::timeout(std::time::Duration::from_secs(10), rx).await;
        self.pending.lock().unwrap().remove(&id);
        response
            .map_err(|_| "Stemmen ophalen duurde te lang.".to_string())?
            .map(|v| v["voices"].clone())
            .map_err(|_| "Spraakhulp niet beschikbaar.".into())
    }
    pub fn control(
        &self,
        app: &tauri::AppHandle,
        action: String,
        id: String,
        text: Option<String>,
        voice_id: Option<String>,
        rate: Option<f64>,
    ) -> Result<(), String> {
        if !["speak", "pause", "resume", "stop"].contains(&action.as_str()) {
            return Err("Onbekende spraakopdracht.".into());
        }
        if action == "speak"
            && (text
                .as_ref()
                .is_none_or(|t| t.trim().is_empty() || t.len() > 1500)
                || rate.is_none_or(|r| !r.is_finite() || !(0.5..=1.3).contains(&r)))
        {
            return Err("Ongeldige tekst of snelheid.".into());
        }
        self.send(
            app,
            json!({"action":action,"id":id,"text":text,"voiceId":voice_id,"rate":rate}),
        )
    }
    pub fn shutdown(&self) {
        if let Ok(mut s) = self.process.lock() {
            if let Some((mut child, _)) = s.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
impl Drop for Speech {
    fn drop(&mut self) {
        self.shutdown();
    }
}
