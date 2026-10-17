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
    pub fn get(&self, id: &str) -> Result<Lesson, String> {
        use rusqlite::OptionalExtension;
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let data: String = c
            .query_row("SELECT data FROM lessons WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("Oefening niet gevonden.")?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }
    pub fn save_language_notes(
        &self,
        id: &str,
        notes: Vec<LanguageNote>,
    ) -> Result<Lesson, String> {
        use rusqlite::OptionalExtension;
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let data: String = c
            .query_row("SELECT data FROM lessons WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("Oefening niet gevonden.")?;
        let mut lesson: Lesson = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        validate_language_notes(&notes, &lesson.sentences)?;
        lesson.language_notes = notes;
        c.execute(
            "UPDATE lessons SET data=?1 WHERE id=?2",
            params![
                serde_json::to_string(&lesson).map_err(|e| e.to_string())?,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(lesson)
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
    pub fn archive(&self, id: &str, archived: bool) -> Result<Lesson, String> {
        use rusqlite::OptionalExtension;
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let data: String = c
            .query_row("SELECT data FROM lessons WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("Oefening niet gevonden.")?;
        let mut lesson: Lesson = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        lesson.archived_at = if archived {
            Some(
                lesson
                    .archived_at
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            )
        } else {
            None
        };
        c.execute(
            "UPDATE lessons SET data=?1 WHERE id=?2",
            params![
                serde_json::to_string(&lesson).map_err(|e| e.to_string())?,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(lesson)
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
            source_group_id: None,
            archived_at: None,
            level: Level::A1,
            created_at: "2026".into(),
            sentences: vec![SentencePair {
                sv: "Hej".into(),
                nl: "Hallo".into(),
            }],
            language_notes: vec![],
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
        for id in [
            "Microsoft-Swedish-voice",
            "local:alma",
            "local:nst",
            "local:supertonic:7",
        ] {
            s.save_settings(&Settings {
                voice_id: id.into(),
                ..Settings::default()
            })
            .unwrap();
            assert_eq!(s.settings().unwrap().voice_id, id);
        }
    }
    fn legacy_lesson() -> Lesson {
        serde_json::from_value(serde_json::json!({
            "id":"legacy", "title":"Oude titel", "source":"SVT", "sourceUrl":null,
            "level":"A1", "createdAt":"2026-10-10T10:00:00Z",
            "sentences":[{"sv":"Hej", "nl":"Hallo"}, {"sv":"God morgon", "nl":"Goedemorgen"}],
            "progress":{"lastSentence":1,"completed":true}
        }))
        .unwrap()
    }
    #[test]
    fn archive_survives_restart_and_progress_updates_and_can_be_restored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lessons.sqlite");
        {
            let store = Store::open(&path).unwrap();
            let legacy = legacy_lesson();
            assert!(legacy.archived_at.is_none());
            assert!(legacy.source_group_id.is_none());
            store.save(&legacy).unwrap();
            let archived = store.archive("legacy", true).unwrap();
            assert!(archived.archived_at.is_some());
            assert_eq!(archived.progress.last_sentence, 1);
            store
                .progress(
                    "legacy",
                    Progress {
                        last_sentence: 0,
                        completed: false,
                    },
                )
                .unwrap();
            assert_eq!(
                store.archive("legacy", true).unwrap().archived_at,
                archived.archived_at
            );
        }
        let store = Store::open(&path).unwrap();
        assert!(store.list().unwrap()[0].archived_at.is_some());
        let restored = store.archive("legacy", false).unwrap();
        assert!(restored.archived_at.is_none());
        assert_eq!(restored.progress.last_sentence, 0);
        assert!(restored.progress.completed);
        assert!(store.archive("missing", true).is_err());
    }
    #[test]
    fn failed_archive_write_keeps_original_lesson() {
        let store = Store::init(Connection::open_in_memory().unwrap()).unwrap();
        store.save(&legacy_lesson()).unwrap();
        store.0.lock().unwrap().execute_batch("CREATE TRIGGER reject_update BEFORE UPDATE ON lessons BEGIN SELECT RAISE(ABORT, 'read-only'); END;").unwrap();
        assert!(store.archive("legacy", true).is_err());
        let lesson = store.list().unwrap().remove(0);
        assert!(lesson.archived_at.is_none());
        assert_eq!(lesson.progress.last_sentence, 1);
    }
    #[test]
    fn notes_survive_restart_and_preserve_latest_progress_and_archive() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.sqlite");
        {
            let store = Store::open(&path).unwrap();
            store.save(&legacy_lesson()).unwrap();
            let before_generation = store.get("legacy").unwrap();
            assert!(before_generation.language_notes.is_empty());
            store
                .progress(
                    "legacy",
                    Progress {
                        last_sentence: 0,
                        completed: false,
                    },
                )
                .unwrap();
            store.archive("legacy", true).unwrap();
            let updated = store
                .save_language_notes("legacy", test_notes("Hej"))
                .unwrap();
            assert_eq!(updated.progress.last_sentence, 0);
            assert!(updated.archived_at.is_some());
            assert_eq!(updated.title, before_generation.title);
            assert_eq!(updated.created_at, before_generation.created_at);
            assert_eq!(updated.level, before_generation.level);
            assert_eq!(updated.sentences[1].sv, before_generation.sentences[1].sv);
        }
        let store = Store::open(&path).unwrap();
        let lesson = store.get("legacy").unwrap();
        assert_eq!(lesson.language_notes.len(), 5);
        store.archive("legacy", false).unwrap();
        store
            .progress(
                "legacy",
                Progress {
                    last_sentence: 1,
                    completed: false,
                },
            )
            .unwrap();
        assert_eq!(
            store.get("legacy").unwrap().language_notes,
            lesson.language_notes
        );
    }
    #[test]
    fn invalid_notes_and_failed_note_write_leave_lesson_unchanged() {
        let store = Store::init(Connection::open_in_memory().unwrap()).unwrap();
        store.save(&legacy_lesson()).unwrap();
        assert!(store
            .save_language_notes("legacy", test_notes("Niet in de tekst"))
            .is_err());
        assert!(store.get("legacy").unwrap().language_notes.is_empty());
        store.0.lock().unwrap().execute_batch("CREATE TRIGGER reject_notes BEFORE UPDATE ON lessons BEGIN SELECT RAISE(ABORT, 'read-only'); END;").unwrap();
        assert!(store
            .save_language_notes("legacy", test_notes("Hej"))
            .is_err());
        assert!(store.get("legacy").unwrap().language_notes.is_empty());
        assert!(store
            .save_language_notes("missing", test_notes("Hej"))
            .is_err());
    }
}
