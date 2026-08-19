// CommandEditor Desktop — Rust backend (minimal, CI-stable)
//
// Philosophy: the web app already implements every PDF operation in
// TypeScript/WASM. The desktop shell adds native chrome only: system tray,
// close-to-tray, global shortcuts, native notifications, multi-window.
//
// The original scaffold shipped 12 Rust commands built on lopdf/pdfium/notify
// — never compiled, duplicated web functionality, and would fail CI. They are
// archived in main_extras.rs.txt for future native-only features. Keep this
// file std+tauri-only so the release workflow stays green on all three OSes.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use tauri::{
    CustomMenuItem, GlobalShortcutManager, Manager, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem, WindowEvent,
};
use uuid::Uuid;

// ─── Commands (native conveniences the webview can invoke) ──────────────────

#[tauri::command]
async fn get_system_info() -> Result<HashMap<String, String>, String> {
    let mut info = HashMap::new();
    info.insert("os".to_string(), std::env::consts::OS.to_string());
    info.insert("arch".to_string(), std::env::consts::ARCH.to_string());
    info.insert("family".to_string(), std::env::consts::FAMILY.to_string());
    info.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
    Ok(info)
}

#[tauri::command]
async fn show_notification(title: String, body: String) -> Result<(), String> {
    tauri::api::notification::Notification::new("com.commandeditor.desktop")
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open CommandEditor"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("new_window", "New Window"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => std::process::exit(0),
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "new_window" => {
                    let _ = tauri::WindowBuilder::new(
                        app,
                        Uuid::new_v4().to_string(),
                        tauri::WindowUrl::App("index.html".into()),
                    )
                    .title("CommandEditor")
                    .inner_size(1200.0, 800.0)
                    .build();
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                // Close to tray instead of quitting
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            show_notification,
        ])
        .setup(|app| {
            let mut shortcuts = app.global_shortcut_manager();
            // Reserved: focus/open shortcuts wired to the webview later
            let _ = shortcuts.register("CmdOrCtrl+Shift+O", || {});
            let _ = shortcuts.register("CmdOrCtrl+Shift+S", || {});
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
