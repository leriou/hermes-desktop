use std::path::{Path, PathBuf};
use std::env;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub fn get_hermes_home_with_profile(app: Option<&AppHandle>, profile: Option<String>) -> PathBuf {
    let home = get_hermes_home(app);
    if let Some(p) = profile {
        if p != "default" && !p.is_empty() {
            return home.join("profiles").join(p);
        }
    }
    home
}

pub fn get_hermes_home(app: Option<&AppHandle>) -> PathBuf {
    // 1. HERMES_HOME env var
    if let Ok(home) = env::var("HERMES_HOME") {
        if !home.trim().is_empty() {
            return normalize_home_path(PathBuf::from(home.trim()));
        }
    }

    // 2. Explicit override file (desktop.json or hermes-home.json)
    if let Some(app) = app {
        let user_data = app.path().app_data_dir().unwrap_or_default();

        // Check hermes-home.json (written by adopt_hermes_home)
        let override_file = user_data.join("hermes-home.json");
        if override_file.exists() {
            if let Ok(content) = fs::read_to_string(&override_file) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(h) = parsed.get("hermesHome").and_then(|v| v.as_str()) {
                        let p = PathBuf::from(h.trim());
                        if p.exists() {
                            return normalize_home_path(p);
                        }
                    }
                }
            }
        }

        // Check desktop.json (written by Tauri locale/connection settings)
        let desktop_file = user_data.join("desktop.json");
        if desktop_file.exists() {
            if let Ok(content) = fs::read_to_string(&desktop_file) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(h) = parsed.get("hermesHome").and_then(|v| v.as_str()) {
                        let p = PathBuf::from(h.trim());
                        if p.exists() {
                            return normalize_home_path(p);
                        }
                    }
                }
            }
        }
    }

    // 3. Default: ~/.hermes — use it if it exists and looks like a hermes home
    let default = normalize_home_path(default_hermes_home());
    if looks_like_hermes_home(&default) {
        return default;
    }

    // 4. Last resort: still return the default path even if it doesn't exist yet
    default
}

fn looks_like_hermes_home(path: &Path) -> bool {
    path.join("hermes-agent").exists()
        || path.join("config.yaml").exists()
        || path.join("active_profile").exists()
        || path.join("sessions").exists()
}

fn normalize_home_path(path: PathBuf) -> PathBuf {
    // If user selected /Users/xmli/.hermes/hermes-agent, back up to .hermes
    if path.file_name().map_or(false, |n| n == "hermes-agent") {
        if let Some(parent) = path.parent() {
            return parent.to_path_buf();
        }
    }
    path
}

fn default_hermes_home() -> PathBuf {
    let home_dir = dirs::home_dir().expect("Could not find home directory");
    home_dir.join(".hermes")
}

pub fn get_python_path(app: Option<&AppHandle>) -> PathBuf {
    let home = get_hermes_home(app);
    let repo = home.join("hermes-agent");

    let candidates = vec![
        repo.join("venv").join("bin").join("python"),
        repo.join(".venv").join("bin").join("python"),
        repo.join("venv").join("Scripts").join("python.exe"),
        repo.join(".venv").join("Scripts").join("python.exe"),
    ];

    for p in candidates {
        if p.exists() {
            return p;
        }
    }

    repo.join("venv").join("bin").join("python")
}

pub fn get_hermes_repo(app: Option<&AppHandle>) -> PathBuf {
    get_hermes_home(app).join("hermes-agent")
}


