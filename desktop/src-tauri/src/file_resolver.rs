use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use std::path::PathBuf;

#[tauri::command]
pub async fn resolve_file(name: String, location: String) -> Result<String, String> {
    let search_dir = match location.as_str() {
        "desktop" => dirs::desktop_dir(),
        "downloads" => dirs::download_dir(),
        "documents" => dirs::document_dir(),
        _ => dirs::home_dir().map(|h| h.join(&location)),
    }
    .ok_or_else(|| format!("Could not resolve location: {}", location))?;

    if !search_dir.exists() {
        return Err(format!("Directory does not exist: {}", search_dir.display()));
    }

    let matcher = SkimMatcherV2::default();
    let mut best: Option<(i64, PathBuf)> = None;

    let entries = std::fs::read_dir(&search_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') || file_name.starts_with('~') {
            continue;
        }
        if let Some(score) = matcher.fuzzy_match(&file_name, &name) {
            if best.as_ref().map_or(true, |(b, _)| score > *b) {
                best = Some((score, entry.path()));
            }
        }
    }

    best.map(|(_, path)| path.to_string_lossy().to_string())
        .ok_or_else(|| format!("'{}' not found in {}", name, location))
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_temp_file(bytes: Vec<u8>, name: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("commandeditor");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let safe_name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();

    let path = temp_dir.join(safe_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn list_folder(location: String) -> Result<Vec<String>, String> {
    let search_dir = match location.as_str() {
        "desktop" => dirs::desktop_dir(),
        "downloads" => dirs::download_dir(),
        "documents" => dirs::document_dir(),
        _ => dirs::home_dir().map(|h| h.join(&location)),
    }
    .ok_or_else(|| format!("Could not resolve location: {}", location))?;

    let mut names = Vec::new();
    for entry in std::fs::read_dir(&search_dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with('.') {
            names.push(name);
        }
    }
    Ok(names)
}