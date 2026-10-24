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
    #[serde(default)]
    pub title_nl: Option<String>,
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
    #[serde(default)]
    pub language_notes: Vec<LanguageNote>,
    #[serde(default)]
    pub grammar_notes: Vec<LanguageNote>,
    pub progress: Progress,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LanguageNote {
    pub title: String,
    pub sentence_index: usize,
    pub excerpt: String,
    pub explanation: String,
}
pub fn validate_language_notes(
    notes: &[LanguageNote],
    sentences: &[SentencePair],
) -> Result<(), String> {
    if notes.len() != 5 {
        return Err("Codex moet precies vijf taalbijzonderheden leveren. Probeer opnieuw.".into());
    }
    let mut seen = std::collections::HashSet::new();
    for note in notes {
        if note.title.trim().is_empty()
            || note.title.chars().count() > 120
            || note.explanation.trim().is_empty()
            || note.explanation.chars().count() > 2000
            || note.excerpt.trim().is_empty()
            || note.excerpt.chars().count() > 1500
        {
            return Err("Codex leverde een leeg of te lang taalpunt. Probeer opnieuw.".into());
        }
        if !sentences
            .get(note.sentence_index)
            .is_some_and(|sentence| sentence.sv.contains(&note.excerpt))
        {
            return Err("Een taalpunt verwijst niet naar een letterlijk fragment uit de oefening. Probeer opnieuw.".into());
        }
        if !seen.insert((
            note.sentence_index,
            note.excerpt.trim().to_lowercase(),
            note.title.trim().to_lowercase(),
        )) {
            return Err("Codex leverde dubbele taalpunten. Probeer opnieuw.".into());
        }
    }
    Ok(())
}
pub fn validate_grammar_notes(
    notes: &[LanguageNote],
    sentences: &[SentencePair],
) -> Result<(), String> {
    validate_language_notes(notes, sentences).map_err(|e| {
        e.replace("taalbijzonderheden", "grammatica-elementen")
            .replace("taalpunt", "grammaticapunt")
            .replace("taalpunten", "grammaticapunten")
    })
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedGrammar {
    pub grammar_notes: Vec<LanguageNote>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedNotes {
    pub language_notes: Vec<LanguageNote>,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Generated {
    pub title_nl: String,
    pub grammar_notes: Vec<LanguageNote>,
    pub title: String,
    pub sentences: Vec<SentencePair>,
    pub language_notes: Vec<LanguageNote>,
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
        validate_title_translation(&self.title_nl)?;
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
        validate_language_notes(&self.language_notes, &self.sentences)?;
        validate_grammar_notes(&self.grammar_notes, &self.sentences)
    }
}
pub fn validate_title_translation(title: &str) -> Result<(), String> {
    if title.trim().is_empty() || title.chars().count() > 2000 {
        return Err("Codex leverde een lege of te lange titelvertaling. Probeer opnieuw.".into());
    }
    Ok(())
}

#[cfg(test)]
pub fn test_notes(excerpt: &str) -> Vec<LanguageNote> {
    (0..5)
        .map(|i| LanguageNote {
            title: format!("Taalpunt {i}"),
            sentence_index: 0,
            excerpt: excerpt.into(),
            explanation: format!("Nederlandse uitleg {i}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_incomplete_output() {
        let g = Generated {
            title_nl: "Nieuws".into(),
            title: "Titel".into(),
            grammar_notes: test_notes("Det regnar."),
            language_notes: vec![],
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
            title_nl: "Nieuws".into(),
            title: "Nyheter".into(),
            grammar_notes: test_notes("Det regnar."),
            language_notes: test_notes("Det regnar."),
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
            title_nl: "Nieuws".into(),
            title: "Nyheter".into(),
            grammar_notes: test_notes("Det regnar."),
            language_notes: test_notes("Det regnar."),
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
    #[test]
    fn rejects_invalid_or_duplicate_language_notes() {
        let sentences = vec![SentencePair {
            sv: "Det regnar.".into(),
            nl: "Het regent.".into(),
        }];
        let valid = test_notes("regnar");
        validate_language_notes(&valid, &sentences).unwrap();
        assert!(validate_language_notes(&valid[..4], &sentences).is_err());
        let mut notes = valid.clone();
        notes[0].sentence_index = 99;
        assert!(validate_language_notes(&notes, &sentences).is_err());
        notes = valid.clone();
        notes[0].excerpt = "snöar".into();
        assert!(validate_language_notes(&notes, &sentences).is_err());
        notes = valid.clone();
        notes[0].explanation = "  ".into();
        assert!(validate_language_notes(&notes, &sentences).is_err());
        notes = valid.clone();
        notes[0].title.clear();
        assert!(validate_language_notes(&notes, &sentences).is_err());
        notes = valid.clone();
        notes[0].excerpt.clear();
        assert!(validate_language_notes(&notes, &sentences).is_err());
        notes = valid.clone();
        notes[1] = notes[0].clone();
        assert!(validate_language_notes(&notes, &sentences).is_err());
        assert!(
            serde_json::from_str::<GeneratedNotes>(r#"{"languageNotes":[],"extra":true}"#).is_err()
        );
        assert!(serde_json::from_str::<Generated>(r#"{"title":"Regn","sentences":[]}"#).is_err());
    }
}
