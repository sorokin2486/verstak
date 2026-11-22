//! App settings: just the library root for now. Stored in the app config dir as settings.json.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::library::{read_text, write_atomic};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub library_root: String,
}

/// D:\Verstak when a D: drive exists, otherwise <Documents>\Verstak. VERSTAK_LIBRARY overrides both.
pub fn default_root(documents: Option<PathBuf>) -> PathBuf {
    if let Ok(env) = std::env::var("VERSTAK_LIBRARY") {
        if !env.trim().is_empty() {
            return PathBuf::from(env);
        }
    }
    if Path::new("D:\\").is_dir() {
        return PathBuf::from("D:\\Verstak");
    }
    documents.unwrap_or_else(|| PathBuf::from(".")).join("Verstak")
}

pub fn load(file: &Path, fallback_root: &Path) -> Settings {
    read_text(file)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .filter(|s| !s.library_root.trim().is_empty())
        .unwrap_or_else(|| Settings { library_root: fallback_root.to_string_lossy().into_owned() })
}

pub fn save(file: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    write_atomic(file, &json).map_err(|e| format!("Не сохранить настройки: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn falls_back_on_missing_or_broken_file_and_round_trips() {
        let tmp = tempdir().unwrap();
        let file = tmp.path().join("cfg").join("settings.json");
        let fallback = Path::new("X:/lib");
        assert_eq!(load(&file, fallback).library_root, "X:/lib");

        save(&file, &Settings { library_root: "Y:/parts".into() }).unwrap();
        assert_eq!(load(&file, fallback).library_root, "Y:/parts");

        std::fs::write(&file, "{broken").unwrap();
        assert_eq!(load(&file, fallback).library_root, "X:/lib");
    }
}
