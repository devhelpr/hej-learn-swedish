use crate::model::*;
use rusqlite::{params, Connection};
use std::{path::Path, sync::Mutex};
pub struct Store(pub Mutex<Connection>);
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let c = Connection::open(path).map_err(|e| e.to_string())?;
        Self::init(c)
    }
    fn init(c: Connection) -> Result<Self, String> {
        c.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); PRAGMA user_version=1;").map_err(|e|e.to_string())?;
        Ok(Self(Mutex::new(c)))
    }
    pub fn save(&self, l: &Lesson) -> Result<(), String> {
        self.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO lessons VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![l.id,l.created_at,serde_json::to_string(l).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<Lesson>, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let mut q = c
            .prepare("SELECT data FROM lessons ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        })
        .collect()
    }
    pub fn progress(&self, id: &str, p: Progress) -> Result<(), String> {
        use rusqlite::OptionalExtension;
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let data = c
            .query_row("SELECT data FROM lessons WHERE id=?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("Oefening niet gevonden.")?;
        let mut l: Lesson = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        if p.last_sentence >= l.sentences.len() {
            return Err("Ongeldige zinpositie.".into());
        }
        l.progress = Progress {
            last_sentence: p.last_sentence,
            completed: l.progress.completed || p.completed,
        };
        c.execute(
            "UPDATE lessons SET data=?1 WHERE id=?2",
            params![serde_json::to_string(&l).map_err(|e| e.to_string())?, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn settings(&self) -> Result<Settings, String> {
        use rusqlite::OptionalExtension;
        let data = self
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .query_row("SELECT data FROM settings WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        data.map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
            .unwrap_or(Ok(Settings::default()))
    }
    pub fn save_settings(&self, s: &Settings) -> Result<(), String> {
        if !s.rate.is_finite() || !(0.5..=1.3).contains(&s.rate) || s.gap_ms > 5000 {
            return Err("Ongeldige afspeelinstellingen.".into());
        }
        self.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",[serde_json::to_string(s).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_resume_and_settings() {
        let s = Store::init(Connection::open_in_memory().unwrap()).unwrap();
        let l = Lesson {
            id: "1".into(),
            title: "Titel".into(),
            source: "Test".into(),
            source_url: None,
            level: Level::A1,
            created_at: "2026".into(),
            sentences: vec![SentencePair {
                sv: "Hej".into(),
                nl: "Hallo".into(),
            }],
            progress: Progress::default(),
        };
        s.save(&l).unwrap();
        s.progress(
            "1",
            Progress {
                last_sentence: 0,
                completed: true,
            },
        )
        .unwrap();
        assert!(s.list().unwrap()[0].progress.completed);
        assert!(s
            .progress(
                "1",
                Progress {
                    last_sentence: 2,
                    completed: false
                }
            )
            .is_err());
        s.save_settings(&Settings::default()).unwrap();
        assert_eq!(s.settings().unwrap().rate, 0.85);
    }
}
