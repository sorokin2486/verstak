//! File access for the part library. Pure std::fs, no Tauri types, so it is unit-testable.
//!
//! Layout: <root>/<part>/drawing.json (Claude), measurements.json (app), .history/drawing.rN.json.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const DRAWING: &str = "drawing.json";
pub const MEASUREMENTS: &str = "measurements.json";
pub const HISTORY_DIR: &str = ".history";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PartFiles {
    pub name: String,
    pub drawing: Option<String>,
    pub measurements: Option<String>,
    pub error: Option<String>,
}

/// Windows device names: opening "CON" or "nul.json" talks to a device, not a file.
fn is_reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit())
}

/// Resolves a part folder, rejecting anything that could escape the library root.
pub fn part_dir(root: &Path, name: &str) -> Result<PathBuf, String> {
    let bad = name.is_empty()
        || name.starts_with('.')
        || name.ends_with('.')
        || name.ends_with(' ')
        || name.len() > 128
        || is_reserved(name)
        || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control());
    if bad {
        return Err(format!("Недопустимое имя детали: {name:?}"));
    }
    Ok(root.join(name))
}

/// Reads a UTF-8 text file; Ok(None) when it does not exist. Strips a BOM (PowerShell adds one).
pub fn read_text(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s.trim_start_matches('\u{feff}').to_string())),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Writes through a temp file and rename, so readers never see a half-written file.
pub fn write_atomic(path: &Path, content: &str) -> io::Result<()> {
    let file_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    let tmp = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// Reads both files of a part. Fails when a file exists but cannot be read (sharing
/// violation, permissions): treating that as "no measurements" would let the next save
/// overwrite everything the user entered.
pub fn read_part(root: &Path, name: &str) -> Result<PartFiles, String> {
    let dir = part_dir(root, name)?;
    let read = |file: &str| read_text(&dir.join(file)).map_err(|e| format!("{name}/{file} не читается: {e}"));
    Ok(PartFiles {
        name: name.to_string(),
        drawing: read(DRAWING)?,
        measurements: read(MEASUREMENTS)?,
        error: None,
    })
}

/// For the sidebar: a part that cannot be read is listed with its error instead of failing the list.
fn read_part_lenient(root: &Path, name: &str) -> PartFiles {
    read_part(root, name).unwrap_or_else(|error| PartFiles {
        name: name.to_string(),
        drawing: None,
        measurements: None,
        error: Some(error),
    })
}

/// All sub-folders of the root that contain a drawing.json, sorted by name.
pub fn list_parts(root: &Path) -> Result<Vec<PartFiles>, String> {
    let entries = fs::read_dir(root).map_err(|e| format!("Не читается папка библиотеки {}: {e}", root.display()))?;
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().join(DRAWING).is_file())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| part_dir(root, n).is_ok())
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    Ok(names.iter().map(|n| read_part_lenient(root, n)).collect())
}

pub fn write_measurements(root: &Path, name: &str, content: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(content).map_err(|e| format!("Замеры не являются JSON: {e}"))?;
    let dir = part_dir(root, name)?;
    if !dir.is_dir() {
        return Err(format!("Нет папки детали {}", dir.display()));
    }
    write_atomic(&dir.join(MEASUREMENTS), content).map_err(|e| format!("Не удалось сохранить замеры: {e}"))
}

fn revision_path(root: &Path, name: &str, revision: u32) -> Result<PathBuf, String> {
    Ok(part_dir(root, name)?.join(HISTORY_DIR).join(format!("drawing.r{revision}.json")))
}

/// Stores a copy of a drawing revision in .history unless one is already there. Returns true when written.
pub fn archive_revision(root: &Path, name: &str, revision: u32, content: &str) -> Result<bool, String> {
    let path = revision_path(root, name, revision)?;
    if path.exists() {
        return Ok(false);
    }
    let dir = path.parent().ok_or("bad history path")?;
    fs::create_dir_all(dir).map_err(|e| format!("Не создать {}: {e}", dir.display()))?;
    write_atomic(&path, content).map_err(|e| format!("Не сохранить ревизию: {e}"))?;
    Ok(true)
}

pub fn read_revision(root: &Path, name: &str, revision: u32) -> Result<Option<String>, String> {
    read_text(&revision_path(root, name, revision)?).map_err(|e| e.to_string())
}

/// Part folder name for a changed path inside the library, if any.
pub fn part_of(root: &Path, changed: &Path) -> Option<String> {
    let rel = changed.strip_prefix(root).ok()?;
    let first = rel.components().next()?;
    let name = first.as_os_str().to_str()?.to_string();
    part_dir(root, &name).ok().map(|_| name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_escaping_names() {
        let root = Path::new("C:/lib");
        for bad in ["", "..", ".history", "a/b", "a\\b", "c:", "x\u{0}", "CON", "nul.json", "com1", "lpt9", "part.", "part "] {
            assert!(part_dir(root, bad).is_err(), "{bad:?} should be rejected");
        }
        assert_eq!(part_dir(root, "easel-bracket").unwrap(), root.join("easel-bracket"));
        assert!(part_dir(root, "console").is_ok());
        assert!(part_dir(root, "com10").is_ok());
    }

    #[test]
    fn lists_only_folders_with_a_drawing_and_strips_bom() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("b-part")).unwrap();
        fs::create_dir_all(root.join("A-part")).unwrap();
        fs::create_dir_all(root.join("empty")).unwrap();
        fs::write(root.join("b-part").join(DRAWING), "\u{feff}{\"x\":1}").unwrap();
        fs::write(root.join("A-part").join(DRAWING), "{}").unwrap();
        fs::write(root.join("A-part").join(MEASUREMENTS), "{\"m\":1}").unwrap();

        let parts = list_parts(root).unwrap();
        let names: Vec<_> = parts.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["A-part", "b-part"]);
        assert_eq!(parts[0].measurements.as_deref(), Some("{\"m\":1}"));
        assert_eq!(parts[1].drawing.as_deref(), Some("{\"x\":1}"));
        assert_eq!(parts[1].measurements, None);
    }

    #[test]
    fn writes_measurements_atomically_and_validates_json() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("p")).unwrap();
        assert!(write_measurements(root, "p", "not json").is_err());
        assert!(write_measurements(root, "missing", "{}").is_err());
        write_measurements(root, "p", "{\"a\":1}").unwrap();
        write_measurements(root, "p", "{\"a\":2}").unwrap();
        assert_eq!(fs::read_to_string(root.join("p").join(MEASUREMENTS)).unwrap(), "{\"a\":2}");
        assert!(!root.join("p").join("measurements.json.tmp").exists());
    }

    #[test]
    fn archives_each_revision_once() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("p")).unwrap();
        assert!(archive_revision(root, "p", 1, "first").unwrap());
        assert!(!archive_revision(root, "p", 1, "second").unwrap());
        assert_eq!(read_revision(root, "p", 1).unwrap().as_deref(), Some("first"));
        assert_eq!(read_revision(root, "p", 2).unwrap(), None);
    }

    #[test]
    fn maps_changed_paths_to_parts() {
        let root = Path::new("D:/Verstak");
        assert_eq!(part_of(root, &root.join("p").join(DRAWING)).as_deref(), Some("p"));
        assert_eq!(part_of(root, &root.join(".git").join("x")), None);
        assert_eq!(part_of(root, Path::new("E:/other/p")), None);
    }
}
