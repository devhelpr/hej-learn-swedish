#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod generation;
mod model;
mod news;
mod speech;
mod store;
use generation::Generation;
use model::*;
use speech::Speech;
use store::Store;
use tauri::{Manager, State};
#[tauri::command]
async fn fetch_news(region: String) -> Result<Vec<NewsItem>, String> {
    news::list(&region).await
}
#[tauri::command]
async fn fetch_article(url: String) -> Result<String, String> {
    news::article(&url).await
}
#[tauri::command]
async fn generate_lesson(
    app: tauri::AppHandle,
    text: String,
    level: Level,
    source: String,
    source_url: Option<String>,
) -> Result<Lesson, String> {
    generation::generate(app, text, level, source, source_url).await
}
#[tauri::command]
fn cancel_generation(s: State<Generation>) {
    s.cancel()
}
#[tauri::command]
fn list_lessons(s: State<Store>) -> Result<Vec<Lesson>, String> {
    s.list()
}
#[tauri::command]
fn save_progress(s: State<Store>, id: String, progress: Progress) -> Result<(), String> {
    s.progress(&id, progress)
}
#[tauri::command]
fn get_settings(s: State<Store>) -> Result<Settings, String> {
    s.settings()
}
#[tauri::command]
fn save_settings(s: State<Store>, settings: Settings) -> Result<(), String> {
    s.save_settings(&settings)
}
#[tauri::command]
fn detect_codex(path: String) -> Result<String, String> {
    generation::detect(&path).map(|p| p.to_string_lossy().into())
}
#[tauri::command]
async fn list_voices(
    app: tauri::AppHandle,
    s: State<'_, Speech>,
) -> Result<serde_json::Value, String> {
    s.voices(&app).await
}
#[tauri::command]
fn speech_control(
    app: tauri::AppHandle,
    s: State<Speech>,
    action: String,
    id: String,
    text: Option<String>,
    voice_id: Option<String>,
    rate: Option<f64>,
) -> Result<(), String> {
    s.control(&app, action, id, text, voice_id, rate)
}
#[tauri::command]
fn open_source(url: String) -> Result<(), String> {
    news::valid_url(&url)?;
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("/usr/bin/open");
    #[cfg(windows)]
    let mut cmd = std::process::Command::new("explorer.exe");
    #[cfg(not(any(target_os = "macos", windows)))]
    return Err("Platform niet ondersteund.".into());
    #[cfg(any(target_os = "macos", windows))]
    {
        cmd.arg(url).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
}
fn main() {
    let app = tauri::Builder::default()
        .manage(Generation(std::sync::Mutex::new(None)))
        .manage(Speech::new())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(Store::open(&dir.join("hej.sqlite")).map_err(std::io::Error::other)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_news,
            fetch_article,
            generate_lesson,
            cancel_generation,
            list_lessons,
            save_progress,
            get_settings,
            save_settings,
            detect_codex,
            list_voices,
            speech_control,
            open_source
        ])
        .build(tauri::generate_context!())
        .expect("App kon niet starten");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<Generation>().cancel();
            app.state::<Speech>().shutdown();
        }
    });
}
