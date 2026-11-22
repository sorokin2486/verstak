// Release builds are a GUI app: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod library;
mod settings;

use library::PartFiles;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use settings::Settings;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Event sent to the UI with the names of parts whose files changed on disk.
const LIBRARY_CHANGED: &str = "library-changed";

struct AppState {
    settings_file: PathBuf,
    settings: Mutex<Settings>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

impl AppState {
    fn root(&self) -> Result<PathBuf, String> {
        let s = self.settings.lock().map_err(|_| "Настройки недоступны".to_string())?;
        Ok(PathBuf::from(&s.library_root))
    }
}

fn is_temp(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "tmp")
}

fn start_watcher(app: &AppHandle, root: &Path) -> Result<RecommendedWatcher, String> {
    let handle = app.clone();
    let watched_root = root.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let mut parts: Vec<String> = event
            .paths
            .iter()
            .filter(|p| !is_temp(p))
            .filter_map(|p| library::part_of(&watched_root, p))
            .collect();
        parts.sort();
        parts.dedup();
        if !parts.is_empty() {
            let _ = handle.emit(LIBRARY_CHANGED, parts);
        }
    })
    .map_err(|e| format!("Не запустить слежение за папкой: {e}"))?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| format!("Не следить за {}: {e}", root.display()))?;
    Ok(watcher)
}

fn ensure_root(root: &Path) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| format!("Не создать папку библиотеки {}: {e}", root.display()))
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    state.settings.lock().map(|s| s.clone()).map_err(|_| "Настройки недоступны".into())
}

#[tauri::command]
fn set_library_root(app: AppHandle, state: State<AppState>, path: String) -> Result<Settings, String> {
    let root = PathBuf::from(path.trim());
    if !root.is_absolute() {
        return Err("Нужен полный путь, например D:\\Verstak".into());
    }
    if root.parent().is_none() {
        return Err("Корень диска не подходит: укажи папку, например D:\\Verstak".into());
    }
    ensure_root(&root)?;
    // Start watching first: if that fails, nothing has been switched or saved yet.
    let watcher = start_watcher(&app, &root)?;
    let next = Settings { library_root: root.to_string_lossy().into_owned() };
    settings::save(&state.settings_file, &next)?;
    *state.settings.lock().map_err(|_| "Настройки недоступны")? = next.clone();
    *state.watcher.lock().map_err(|_| "Слежение недоступно")? = Some(watcher);
    Ok(next)
}

#[tauri::command]
fn list_parts(state: State<AppState>) -> Result<Vec<PartFiles>, String> {
    let root = state.root()?;
    ensure_root(&root)?;
    library::list_parts(&root)
}

#[tauri::command]
fn read_part(state: State<AppState>, name: String) -> Result<PartFiles, String> {
    library::read_part(&state.root()?, &name)
}

#[tauri::command]
fn write_measurements(state: State<AppState>, name: String, content: String) -> Result<(), String> {
    library::write_measurements(&state.root()?, &name, &content)
}

#[tauri::command]
fn archive_revision(state: State<AppState>, name: String, revision: u32, content: String) -> Result<bool, String> {
    library::archive_revision(&state.root()?, &name, revision, &content)
}

#[tauri::command]
fn read_revision(state: State<AppState>, name: String, revision: u32) -> Result<Option<String>, String> {
    library::read_revision(&state.root()?, &name, revision)
}

#[tauri::command]
fn open_part_folder(state: State<AppState>, name: String) -> Result<(), String> {
    let dir = library::part_dir(&state.root()?, &name)?;
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Не открыть проводник: {e}"))
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let paths = app.path();
    let settings_file = paths.app_config_dir()?.join("settings.json");
    let fallback = settings::default_root(paths.document_dir().ok());
    let current = settings::load(&settings_file, &fallback);
    let root = PathBuf::from(&current.library_root);
    ensure_root(&root)?;
    // A failed watcher is not fatal: the UI still works and can be refreshed by hand.
    let watcher = start_watcher(app.handle(), &root).map_err(|e| eprintln!("{e}")).ok();
    app.manage(AppState { settings_file, settings: Mutex::new(current), watcher: Mutex::new(watcher) });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_library_root,
            list_parts,
            read_part,
            write_measurements,
            archive_revision,
            read_revision,
            open_part_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Verstak");
}
