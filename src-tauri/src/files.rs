use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const MAX_DOCUMENT: u64 = 16 * 1024 * 1024;
const MAX_RESOURCE: u64 = 50 * 1024 * 1024;
const MAX_RECENT: usize = 12;

#[derive(Default)]
pub struct Docs {
    approved: Mutex<HashSet<PathBuf>>,
    pending: Mutex<Vec<String>>,
}

#[derive(Serialize, Clone)]
pub struct OpenedDoc {
    pub path: String,
    pub name: String,
    pub text: String,
}

fn display_name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn read_text(p: &Path) -> Result<String, String> {
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    if meta.len() > MAX_DOCUMENT {
        return Err("file too large".into());
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|_| "not-utf8".into())
}

pub fn write_atomic(p: &Path, data: &[u8], private: bool) -> Result<(), String> {
    let dir = p.parent().ok_or("no parent directory")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(".{}.{}.tmp", display_name(p), std::process::id()));
    {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        if private {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        #[cfg(not(unix))]
        let _ = private;
        let mut f = opts.open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().ok();
    }
    fs::rename(&tmp, p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn recent_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("recent.json"))
}

fn load_recent(app: &AppHandle) -> Vec<String> {
    recent_file(app)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

fn remember(app: &AppHandle, p: &Path) {
    let s = p.to_string_lossy().into_owned();
    let mut list = load_recent(app);
    list.retain(|x| x != &s);
    list.insert(0, s);
    list.truncate(MAX_RECENT);
    if let (Ok(f), Ok(json)) = (recent_file(app), serde_json::to_string(&list)) {
        let _ = write_atomic(&f, json.as_bytes(), false);
    }
}

fn open_path(app: &AppHandle, docs: &Docs, p: PathBuf) -> Result<OpenedDoc, String> {
    let text = read_text(&p)?;
    docs.approved.lock().unwrap().insert(p.clone());
    remember(app, &p);
    Ok(OpenedDoc {
        path: p.to_string_lossy().into_owned(),
        name: display_name(&p),
        text,
    })
}

pub fn queue_open(app: &AppHandle, paths: Vec<PathBuf>) {
    let docs = app.state::<Docs>();
    let mut accepted = Vec::new();
    for p in paths {
        if p.is_file() {
            docs.approved.lock().unwrap().insert(p.clone());
            accepted.push(p.to_string_lossy().into_owned());
        }
    }
    if accepted.is_empty() {
        return;
    }
    docs.pending.lock().unwrap().extend(accepted.clone());
    let _ = app.emit("open-files", accepted);
}

#[tauri::command]
pub fn take_pending(docs: State<Docs>) -> Vec<String> {
    std::mem::take(&mut *docs.pending.lock().unwrap())
}

#[tauri::command]
pub fn recent(app: AppHandle) -> Vec<String> {
    load_recent(&app)
        .into_iter()
        .filter(|p| Path::new(p).is_file())
        .collect()
}

#[tauri::command]
pub fn open_document(app: AppHandle, docs: State<Docs>, path: String) -> Result<OpenedDoc, String> {
    let p = PathBuf::from(&path);
    let known = docs.approved.lock().unwrap().contains(&p) || load_recent(&app).contains(&path);
    if !known {
        return Err("this file was not chosen by the user".into());
    }
    open_path(&app, &docs, p)
}

#[tauri::command]
pub async fn open_dialog(app: AppHandle) -> Result<Option<OpenedDoc>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_pick_file();
    let Some(fp) = picked else { return Ok(None) };
    let p = fp.into_path().map_err(|e| e.to_string())?;
    let docs = app.state::<Docs>();
    open_path(&app, &docs, p).map(Some)
}

#[tauri::command]
pub fn save_document(
    app: AppHandle,
    docs: State<Docs>,
    path: String,
    text: String,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !docs.approved.lock().unwrap().contains(&p) {
        return Err("this file was not chosen by the user".into());
    }
    write_atomic(&p, text.as_bytes(), false)?;
    remember(&app, &p);
    Ok(())
}

#[tauri::command]
pub async fn save_dialog(
    app: AppHandle,
    suggested: String,
    text: String,
) -> Result<Option<OpenedDoc>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(&suggested)
        .blocking_save_file();
    let Some(fp) = picked else { return Ok(None) };
    let p = fp.into_path().map_err(|e| e.to_string())?;
    write_atomic(&p, text.as_bytes(), false)?;
    let docs = app.state::<Docs>();
    docs.approved.lock().unwrap().insert(p.clone());
    remember(&app, &p);
    Ok(Some(OpenedDoc {
        path: p.to_string_lossy().into_owned(),
        name: display_name(&p),
        text,
    }))
}

#[tauri::command]
pub fn read_resource(
    docs: State<Docs>,
    doc: String,
    reference: String,
) -> Result<tauri::ipc::Response, String> {
    let doc = PathBuf::from(doc);
    if !docs.approved.lock().unwrap().contains(&doc) {
        return Err("unknown document".into());
    }
    let rel = Path::new(&reference);
    // security: the core passes a decoded path and already rejects these; checked again so a bad path cannot leave the folder, name a drive, or reach an NTFS alternate data stream
    if reference.contains([':', '\\']) || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("bad reference".into());
    }
    let dir = doc
        .parent()
        .ok_or("no folder")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = dir.join(rel).canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&dir) {
        return Err("outside the document folder".into());
    }
    let meta = fs::metadata(&target).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_RESOURCE {
        return Err("not a regular file".into());
    }
    Ok(tauri::ipc::Response::new(
        fs::read(&target).map_err(|e| e.to_string())?,
    ))
}

fn mdsig_dir() -> Result<PathBuf, String> {
    if let Ok(d) = std::env::var("MDSIG_TEST_CONFIG_DIR") {
        if !d.is_empty() {
            return Ok(PathBuf::from(d));
        }
    }
    Ok(dirs::config_dir()
        .ok_or("no config directory")?
        .join("mdsig"))
}

const SHARED: [&str; 2] = ["known_signers.json", "key_directories.json"];
const LOCAL: [&str; 4] = ["settings.json", "keys.json", "last.json", "passkeys.json"];

#[tauri::command]
pub fn shared_read(name: String) -> Result<Option<String>, String> {
    if !SHARED.contains(&name.as_str()) {
        return Err("unknown file".into());
    }
    Ok(fs::read_to_string(mdsig_dir()?.join(name)).ok())
}

#[tauri::command]
pub fn shared_write(name: String, text: String) -> Result<(), String> {
    if !SHARED.contains(&name.as_str()) {
        return Err("unknown file".into());
    }
    write_atomic(&mdsig_dir()?.join(name), text.as_bytes(), true)
}

#[tauri::command]
pub fn local_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    if !LOCAL.contains(&name.as_str()) {
        return Err("unknown file".into());
    }
    Ok(fs::read_to_string(
        app.path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join(name),
    )
    .ok())
}

#[tauri::command]
pub fn local_write(app: AppHandle, name: String, text: String) -> Result<(), String> {
    if !LOCAL.contains(&name.as_str()) {
        return Err("unknown file".into());
    }
    write_atomic(
        &app.path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join(name),
        text.as_bytes(),
        true,
    )
}

#[tauri::command]
pub fn host_name() -> String {
    let h = gethostname::gethostname().to_string_lossy().into_owned();
    h.trim_end_matches(".local").to_string()
}
