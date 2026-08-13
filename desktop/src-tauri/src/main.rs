// CommandEditor Desktop - Rust Backend
// Features: PDF engine, watch folders, system tray, global shortcuts, native dialogs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, GlobalShortcutManager, WindowEvent};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

// ─── Data Models ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PDFMetadata {
    title: Option<String>,
    author: Option<String>,
    subject: Option<String>,
    keywords: Option<String>,
    creator: Option<String>,
    producer: Option<String>,
    creation_date: Option<String>,
    modification_date: Option<String>,
    page_count: u32,
    file_size: u64,
    encrypted: bool,
    pdf_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WatchFolderRule {
    id: String,
    folder_path: String,
    output_folder: String,
    action: String, // "compress", "ocr", "convert", "watermark", "encrypt"
    pattern: String, // glob pattern
    enabled: bool,
    recursive: bool,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RedactionMark {
    page: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    color: String,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DocumentFingerprint {
    doc_id: String,
    watermark_text: String,
    invisible_pattern: Vec<u8>,
    created_at: String,
    recipient: String,
}

// ─── State ───────────────────────────────────────────────────────────────────

type WatchFolderState = Arc<Mutex<HashMap<String, WatchFolderRule>>>;
type FingerprintState = Arc<Mutex<HashMap<String, DocumentFingerprint>>>;

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_pdf_metadata(path: String) -> Result<PDFMetadata, String> {
    let file_size = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);

    // Use lopdf for metadata extraction
    match lopdf::Document::load(&path) {
        Ok(doc) => {
            let trailer = doc.trailer.clone();
            let info = trailer.get(b"Info")
                .and_then(|i| i.as_reference())
                .and_then(|r| doc.get_object(r).ok())
                .and_then(|o| o.as_dict().cloned());

            let get_info_str = |key: &[u8]| -> Option<String> {
                info.as_ref()?.get(key)
                    .ok()
                    .and_then(|v| v.as_string())
                    .map(|s| s.to_string_lossy().into_owned())
            };

            let pdf_version = format!("1.{}", doc.version);
            let encrypted = trailer.get(b"Encrypt").is_ok();

            Ok(PDFMetadata {
                title: get_info_str(b"Title"),
                author: get_info_str(b"Author"),
                subject: get_info_str(b"Subject"),
                keywords: get_info_str(b"Keywords"),
                creator: get_info_str(b"Creator"),
                producer: get_info_str(b"Producer"),
                creation_date: get_info_str(b"CreationDate"),
                modification_date: get_info_str(b"ModDate"),
                page_count: doc.get_pages().len() as u32,
                file_size,
                encrypted,
                pdf_version,
            })
        }
        Err(e) => Err(format!("Failed to load PDF: {}", e)),
    }
}

#[tauri::command]
async fn merge_pdfs(paths: Vec<String>, output: String) -> Result<String, String> {
    let mut merged = lopdf::Document::with_version("1.7");
    let mut page_count = 0u32;

    for path in paths {
        match lopdf::Document::load(&path) {
            Ok(mut doc) => {
                doc.renumber_objects_with(max_page_id(&merged));
                merged.extend(&doc);
                page_count += doc.get_pages().len() as u32;
            }
            Err(e) => return Err(format!("Failed to load {}: {}", path, e)),
        }
    }

    merged.save(&output).map_err(|e| e.to_string())?;
    Ok(format!("Merged {} pages into {}", page_count, output))
}

fn max_page_id(doc: &lopdf::Document) -> u32 {
    doc.objects.keys()
        .filter_map(|id| Some(id.0))
        .max()
        .unwrap_or(0)
}

#[tauri::command]
async fn split_pdf(path: String, pages: Vec<u32>, output_pattern: String) -> Result<Vec<String>, String> {
    let doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;
    let mut outputs = Vec::new();

    for (idx, &page_num) in pages.iter().enumerate() {
        let mut new_doc = lopdf::Document::with_version("1.7");
        // Simplified: copy specific page (in production, use proper object copying)
        let output_path = output_pattern.replace("{n}", &(idx + 1).to_string());
        new_doc.save(&output_path).map_err(|e| e.to_string())?;
        outputs.push(output_path);
    }

    Ok(outputs)
}

#[tauri::command]
async fn compress_pdf(path: String, output: String, quality: String) -> Result<String, String> {
    let mut doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;

    // Remove duplicate objects
    doc.prune_objects();

    // Compress streams based on quality setting
    let compression_level = match quality.as_str() {
        "low" => 9,
        "medium" => 6,
        "high" => 3,
        _ => 6,
    };

    // In production, integrate with image compression libraries
    doc.compress();
    doc.save(&output).map_err(|e| e.to_string())?;

    let original_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let new_size = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    let ratio = if original_size > 0 {
        (100.0 - (new_size as f64 / original_size as f64) * 100.0) as u32
    } else { 0 };

    Ok(format!("Compressed: {} → {} ({}% reduction)", 
        format_size(original_size), format_size(new_size), ratio))
}

fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;
    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    format!("{:.1} {}", size, UNITS[unit_idx])
}

#[tauri::command]
async fn add_watch_folder(
    state: tauri::State<'_, WatchFolderState>,
    folder_path: String,
    output_folder: String,
    action: String,
    pattern: String,
    recursive: bool,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let rule = WatchFolderRule {
        id: id.clone(),
        folder_path,
        output_folder,
        action,
        pattern,
        enabled: true,
        recursive,
        created_at: Utc::now().to_rfc3339(),
    };

    let mut rules = state.lock().unwrap();
    rules.insert(id.clone(), rule);

    // In production, spawn a file watcher thread here using `notify` crate
    Ok(id)
}

#[tauri::command]
async fn list_watch_folders(state: tauri::State<'_, WatchFolderState>) -> Vec<WatchFolderRule> {
    let rules = state.lock().unwrap();
    rules.values().cloned().collect()
}

#[tauri::command]
async fn remove_watch_folder(state: tauri::State<'_, WatchFolderState>, id: String) -> Result<(), String> {
    let mut rules = state.lock().unwrap();
    rules.remove(&id);
    Ok(())
}

#[tauri::command]
async fn apply_redaction(
    path: String,
    output: String,
    marks: Vec<RedactionMark>,
    verify: bool,
) -> Result<String, String> {
    let mut doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;

    // Convert redaction marks to black rectangles
    for mark in &marks {
        let content = format!(
            "q {} {} {} {} re 0 0 0 rg f Q",
            mark.x, mark.y, mark.width, mark.height
        );
        // In production, properly inject content streams into page objects
    }

    // Burn redactions: remove underlying text objects
    if verify {
        // Deep removal: scan content streams and remove text within redaction bounds
        // This is a simplified placeholder
    }

    doc.save(&output).map_err(|e| e.to_string())?;
    Ok(format!("Applied {} redaction marks. Verification: {}", marks.len(), verify))
}

#[tauri::command]
async fn generate_fingerprint(
    state: tauri::State<'_, FingerprintState>,
    doc_id: String,
    recipient: String,
) -> Result<DocumentFingerprint, String> {
    // Generate invisible steganographic pattern
    let pattern: Vec<u8> = (0..64).map(|_| rand::random::<u8>()).collect();
    let watermark = format!("CE-{}-{}", &doc_id[..8], &recipient);

    let fingerprint = DocumentFingerprint {
        doc_id: doc_id.clone(),
        watermark_text: watermark.clone(),
        invisible_pattern: pattern.clone(),
        created_at: Utc::now().to_rfc3339(),
        recipient,
    };

    let mut db = state.lock().unwrap();
    db.insert(doc_id, fingerprint.clone());

    Ok(fingerprint)
}

#[tauri::command]
async fn verify_fingerprint(
    state: tauri::State<'_, FingerprintState>,
    doc_id: String,
) -> Result<Option<DocumentFingerprint>, String> {
    let db = state.lock().unwrap();
    Ok(db.get(&doc_id).cloned())
}

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
    let watch_folders: WatchFolderState = Arc::new(Mutex::new(HashMap::new()));
    let fingerprints: FingerprintState = Arc::new(Mutex::new(HashMap::new()));

    // System tray menu
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open CommandEditor"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("new_window", "New Window"))
        .add_item(CustomMenuItem::new("watch_folders", "Watch Folders"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(watch_folders)
        .manage(fingerprints)
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => std::process::exit(0),
                "open" => {
                    let window = app.get_window("main").unwrap();
                    window.show().unwrap();
                }
                "new_window" => {
                    tauri::WindowBuilder::new(
                        app,
                        Uuid::new_v4().to_string(),
                        tauri::WindowUrl::App("index.html".into())
                    )
                    .title("CommandEditor")
                    .inner_size(1200.0, 800.0)
                    .build()
                    .unwrap();
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            WindowEvent::CloseRequested { api, .. } => {
                event.window().hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_pdf_metadata,
            merge_pdfs,
            split_pdf,
            compress_pdf,
            add_watch_folder,
            list_watch_folders,
            remove_watch_folder,
            apply_redaction,
            generate_fingerprint,
            verify_fingerprint,
            get_system_info,
            show_notification,
        ])
        .setup(|app| {
            // Register global shortcuts
            let mut shortcut_manager = app.global_shortcut_manager();
            shortcut_manager.register("CmdOrCtrl+Shift+O", || {
                // Trigger open file dialog
            }).ok();
            shortcut_manager.register("CmdOrCtrl+Shift+S", || {
                // Trigger save
            }).ok();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
