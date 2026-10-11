use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Level {
    A1,
    A2,
    B1,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SentencePair {
    pub sv: String,
    pub nl: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub source: String,
    pub url: String,
    pub published_at: Option<String>,
    pub summary: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    pub id: String,
    pub title: String,
    pub source: String,
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_group_id: Option<String>,
    #[serde(default)]
    pub archived_at: Option<String>,
    pub level: Level,
    pub created_at: String,
    pub sentences: Vec<SentencePair>,
    pub progress: Progress,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub last_sentence: usize,
    pub completed: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub codex_path: String,
    pub voice_id: String,
    pub rate: f64,
    pub gap_ms: u64,
    pub show_translation: bool,
    pub auto_advance: bool,
    pub level: Level,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            codex_path: String::new(),
            voice_id: String::new(),
            rate: 0.85,
            gap_ms: 1000,
            show_translation: true,
            auto_advance: true,
            level: Level::A2,
        }
    }
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Generated {
    pub title: String,
    pub sentences: Vec<SentencePair>,
}
impl Generated {
    pub fn validate_level(&self, level: &Level) -> Result<(), String> {
        let maximum = match level {
            Level::A1 => 12,
            Level::A2 => 24,
            Level::B1 => 40,
        };
        if self
            .sentences
            .iter()
            .any(|s| s.sv.split_whitespace().count() > maximum)
        {
            return Err(format!(
                "Codex maakte te lange zinnen voor niveau {level:?}. Probeer opnieuw."
            ));
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() || self.title.len() > 300 {
            return Err("De gegenereerde titel is ongeldig.".into());
        }
        if !(8..=16).contains(&self.sentences.len()) {
            return Err("Codex moet 8 tot 16 zinparen leveren.".into());
        }
        if self.sentences.iter().any(|s| {
            s.sv.trim().is_empty()
                || s.nl.trim().is_empty()
                || s.sv.len() > 1500
                || s.nl.len() > 1500
        }) {
            return Err("Codex leverde een leeg of te lang zinpaar.".into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_incomplete_output() {
        let g = Generated {
            title: "Titel".into(),
            sentences: vec![],
        };
        assert!(g.validate().is_err());
        assert!(
            serde_json::from_str::<Generated>(r#"{"title":"x","sentences":[],"extra":1}"#).is_err()
        );
    }
    #[test]
    fn rejects_sentences_too_long_for_selected_level() {
        let g = Generated {
            title: "Nyheter".into(),
            sentences: vec![SentencePair {
                sv: vec!["ord"; 13].join(" "),
                nl: "Vertaling".into(),
            }],
        };
        assert!(g.validate_level(&Level::A1).is_err());
        assert!(g.validate_level(&Level::A2).is_ok());
    }
    #[test]
    fn validates_pairs() {
        let mut g = Generated {
            title: "Nyheter".into(),
            sentences: (0..12)
                .map(|_| SentencePair {
                    sv: "Det regnar.".into(),
                    nl: "Het regent.".into(),
                })
                .collect(),
        };
        assert!(g.validate().is_ok());
        g.sentences[0].nl.clear();
        assert!(g.validate().is_err());
    }
}
