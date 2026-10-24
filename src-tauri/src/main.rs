#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod generation;
mod model;
mod news;
mod speech;
mod store;
mod voices;
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
    title: String,
    source_group_id: Option<String>,
) -> Result<Lesson, String> {
    generation::generate(app, text, level, source, source_url, title, source_group_id).await
}
#[tauri::command]
async fn generate_language_notes(app: tauri::AppHandle, id: String) -> Result<Lesson, String> {
    generation::generate_notes(app, id).await
}
#[tauri::command]
async fn generate_grammar_notes(app: tauri::AppHandle, id: String) -> Result<Lesson, String> {
    generation::generate_grammar(app, id).await
}
#[tauri::command]
async fn generate_title_translation(app: tauri::AppHandle, id: String) -> Result<Lesson, String> {
    generation::generate_title(app, id).await
}
#[tauri::command]
async fn ask_exercise_question(
    app: tauri::AppHandle,
    id: String,
    question: String,
    sentence_index: Option<usize>,
) -> Result<generation::ExerciseAnswer, String> {
    generation::ask_question(app, id, question, sentence_index).await
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
fn set_lesson_archived(s: State<Store>, id: String, archived: bool) -> Result<Lesson, String> {
    s.archive(&id, archived)
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
async fn list_downloadable_voices(
    app: tauri::AppHandle,
    s: State<'_, voices::Downloads>,
) -> Result<Vec<voices::AvailableVoice>, String> {
    voices::list(&app, &s).await
}
#[tauri::command]
async fn install_voice(
    app: tauri::AppHandle,
    s: State<'_, voices::Downloads>,
    id: String,
) -> Result<(), String> {
    voices::install(&app, &s, &id).await
}
#[tauri::command]
fn cancel_voice_download(s: State<voices::Downloads>, id: String) {
    s.cancel(&id);
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
        .manage(voices::Downloads::default())
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
            generate_language_notes,
            generate_grammar_notes,
            generate_title_translation,
            ask_exercise_question,
            cancel_generation,
            list_lessons,
            save_progress,
            set_lesson_archived,
            get_settings,
            save_settings,
            detect_codex,
            list_voices,
            list_downloadable_voices,
            install_voice,
            cancel_voice_download,
            speech_control,
            open_source
        ])
        .build(tauri::generate_context!())
        .expect("App kon niet starten");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<Generation>().cancel();
            app.state::<Speech>().shutdown();
            app.state::<voices::Downloads>().shutdown();
        }
    });
}
