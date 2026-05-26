use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use crate::python;
use tauri::AppHandle;

const MEMORY_CHAR_LIMIT: usize = 2200;
const USER_CHAR_LIMIT: usize = 1375;
const ENTRY_DELIMITER: &str = "\n§\n";

fn hermes_home(app: Option<&AppHandle>, profile: Option<String>) -> PathBuf {
    python::get_hermes_home_with_profile(app, profile)
}

fn memory_path(app: Option<&AppHandle>, profile: Option<String>) -> PathBuf {
    hermes_home(app, profile).join("memories").join("MEMORY.md")
}

fn user_path(app: Option<&AppHandle>, profile: Option<String>) -> PathBuf {
    hermes_home(app, profile).join("memories").join("USER.md")
}

fn read_file_safe(path: &PathBuf) -> (String, bool, Option<u64>) {
    if !path.exists() {
        return (String::new(), false, None);
    }
    match fs::read_to_string(path) {
        Ok(content) => {
            let modified = fs::metadata(path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            (content, true, modified)
        }
        Err(_) => (String::new(), false, None),
    }
}

fn parse_entries(content: &str) -> Vec<Value> {
    if content.trim().is_empty() {
        return vec![];
    }
    content
        .split(ENTRY_DELIMITER)
        .enumerate()
        .filter(|(_, e)| !e.trim().is_empty())
        .map(|(i, e)| json!({ "index": i, "content": e.trim() }))
        .collect()
}

fn serialize_entries(entries: &[Value]) -> String {
    entries
        .iter()
        .filter_map(|e| e.get("content").and_then(|c| c.as_str()))
        .collect::<Vec<_>>()
        .join(ENTRY_DELIMITER)
}

pub fn read_memory(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let mem_path = memory_path(app, profile.clone());
    let user_p = user_path(app, profile);

    let (mem_content, mem_exists, mem_modified) = read_file_safe(&mem_path);
    let (user_content, user_exists, user_modified) = read_file_safe(&user_p);

    let mem_entries = parse_entries(&mem_content);

    Ok(json!({
        "memory": {
            "content": mem_content,
            "exists": mem_exists,
            "lastModified": mem_modified,
            "entries": mem_entries,
            "charCount": mem_content.len(),
            "charLimit": MEMORY_CHAR_LIMIT,
        },
        "user": {
            "content": user_content,
            "exists": user_exists,
            "lastModified": user_modified,
            "charCount": user_content.len(),
            "charLimit": USER_CHAR_LIMIT,
        },
        "stats": {
            "totalSessions": 0,
            "totalMessages": 0,
        }
    }))
}

pub fn add_memory_entry(app: Option<&AppHandle>, profile: Option<String>, text: String) -> Result<Value, String> {
    let path = memory_path(app, profile);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let (existing, _, _) = read_file_safe(&path);
    let mut entries = parse_entries(&existing);
    let index = entries.len();
    let entry = json!({ "index": index, "content": text.trim() });
    entries.push(entry.clone());

    let new_content = serialize_entries(&entries);
    if new_content.len() > MEMORY_CHAR_LIMIT {
        return Err(format!("Would exceed memory limit ({}/{} chars)", new_content.len(), MEMORY_CHAR_LIMIT));
    }

    fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(entry)
}

pub fn update_memory_entry(app: Option<&AppHandle>, profile: Option<String>, index: usize, text: String) -> Result<bool, String> {
    let path = memory_path(app, profile);
    let (existing, _, _) = read_file_safe(&path);
    let mut entries = parse_entries(&existing);

    if index >= entries.len() {
        return Err("Entry not found".to_string());
    }

    entries[index] = json!({ "index": index, "content": text.trim() });
    let new_content = serialize_entries(&entries);

    if new_content.len() > MEMORY_CHAR_LIMIT {
        return Err(format!("Would exceed memory limit ({}/{} chars)", new_content.len(), MEMORY_CHAR_LIMIT));
    }

    fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn remove_memory_entry(app: Option<&AppHandle>, profile: Option<String>, index: usize) -> Result<bool, String> {
    let path = memory_path(app, profile);
    let (existing, _, _) = read_file_safe(&path);
    let mut entries = parse_entries(&existing);

    if index >= entries.len() {
        return Ok(false);
    }

    entries.remove(index);
    for (i, e) in entries.iter_mut().enumerate() {
        if let Some(obj) = e.as_object_mut() {
            obj.insert("index".to_string(), json!(i));
        }
    }

    let new_content = serialize_entries(&entries);
    fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn write_memory(app: Option<&AppHandle>, profile: Option<String>, content: String) -> Result<(), String> {
    let path = memory_path(app, profile);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

pub fn write_user_profile(app: Option<&AppHandle>, profile: Option<String>, content: String) -> Result<(), String> {
    let path = user_path(app, profile);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if content.len() > USER_CHAR_LIMIT {
        return Err(format!("Exceeds limit ({}/{} chars)", content.len(), USER_CHAR_LIMIT));
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// --- Soul ---

#[allow(dead_code)]
pub fn read_soul(app: Option<&AppHandle>, profile: Option<String>) -> Result<String, String> {
    let soul_file = hermes_home(app, profile).join("SOUL.md");
    if !soul_file.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(soul_file).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn write_soul(app: Option<&AppHandle>, profile: Option<String>, text: String) -> Result<(), String> {
    let soul_file = hermes_home(app, profile).join("SOUL.md");
    if let Some(parent) = soul_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(soul_file, text).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn reset_soul(app: Option<&AppHandle>, profile: Option<String>) -> Result<(), String> {
    let soul_file = hermes_home(app, profile).join("SOUL.md");
    if soul_file.exists() {
        fs::remove_file(soul_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}
