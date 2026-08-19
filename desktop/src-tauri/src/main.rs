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
use std::sync::{mpsc::Receiver, Mutex, OnceLock};
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

// ─── OAuth loopback (desktop cloud sign-in) ─────────────────────────────────
//
// Google blocks OAuth inside embedded webviews, and providers won't whitelist
// Tauri's tauri.localhost origin. So on desktop the webview opens the SYSTEM
// browser; the provider redirects to the production site's callback page
// (already registered), which relays the token to this loopback listener.
// Token path: provider → commandeditor.com (static page; the URL fragment
// never reaches any server) → 127.0.0.1 (never leaves the machine).
//
// Flow: webview invokes start_oauth_listener → gets an ephemeral port → opens
// the browser → invokes await_oauth_callback(port), which resolves with the
// redirect's path+query (or a 5-minute timeout error).

static OAUTH_WAITERS: OnceLock<Mutex<HashMap<u16, Receiver<String>>>> = OnceLock::new();

fn oauth_waiters() -> &'static Mutex<HashMap<u16, Receiver<String>>> {
    OAUTH_WAITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
fn start_oauth_listener() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    oauth_waiters().lock().map_err(|e| e.to_string())?.insert(port, rx);
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            use std::io::{Read, Write};
            let mut buf = [0u8; 8192];
            if let Ok(n) = stream.read(&mut buf) {
                let req = String::from_utf8_lossy(&buf[..n]);
                let first = req.lines().next().unwrap_or("");
                let method = first.split_whitespace().next().unwrap_or("");
                let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
                // CORS headers included so the relay page may also use fetch()
                // (top-level navigation is the primary path, fetch a fallback).
                let (status, body) = if method == "OPTIONS" {
                    ("204 No Content", String::new())
                } else {
                    ("200 OK", "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:4em\"><h2>Sign-in complete</h2><p>You can close this tab and return to CommandEditor.</p></body></html>".to_string())
                };
                let resp = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = tx.send(path);
            }
        }
    });
    Ok(port)
}

#[tauri::command]
async fn await_oauth_callback(port: u16) -> Result<String, String> {
    let rx = oauth_waiters()
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&port)
        .ok_or_else(|| "no OAuth listener registered for that port".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(300))
            .map_err(|_| "Sign-in timed out (no response within 5 minutes).".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
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
            start_oauth_listener,
            await_oauth_callback,
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
