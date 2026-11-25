mod files;
mod keys;

use std::path::PathBuf;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

pub const HANDOFF_SCHEME: &str = "mdsig+fountain-pen";

fn forward_handoff(app: &AppHandle, url: &url::Url) {
    if url.scheme() == HANDOFF_SCHEME {
        let _ = app.emit("handoff", url.as_str());
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
}

pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        let paths: Vec<PathBuf> = argv.iter().skip(1).filter(|a| !a.contains("://")).map(PathBuf::from).collect();
        files::queue_open(app, paths);
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }));
    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(files::Docs::default())
        .setup(|app| {
            let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
            files::queue_open(app.handle(), args);
            #[cfg(any(windows, target_os = "linux"))]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    forward_handoff(&handle, &url);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                files::queue_open(window.app_handle(), paths.clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            files::take_pending,
            files::recent,
            files::open_document,
            files::open_dialog,
            files::save_document,
            files::save_dialog,
            files::read_resource,
            files::shared_read,
            files::shared_write,
            files::local_read,
            files::local_write,
            files::host_name,
            keys::keychain_set,
            keys::keychain_get,
            keys::keychain_delete,
            keys::ssh_key_files,
            keys::ssh_key_unlock,
            keys::ssh_key_export,
            keys::agent_keys,
            keys::agent_sign,
            keys::gpg_secret_keys,
            keys::gpg_sign,
            keys::gpg_export,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the application");

    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
            files::queue_open(handle, paths);
        }
        let _ = (handle, event);
    });
}
