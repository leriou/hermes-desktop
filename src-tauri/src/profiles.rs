use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use crate::python;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileInfo {
    pub name: String,
    pub path: String,
    pub is_default: bool,
    pub is_active: bool,
    pub model: String,
    pub provider: String,
    pub has_env: bool,
    pub has_soul: bool,
    pub skill_count: u32,
    pub gateway_running: bool,
}

pub fn get_profiles_dir(app: Option<&AppHandle>) -> PathBuf {
    python::get_hermes_home(app).join("profiles")
}

pub fn get_active_profile_name(app: Option<&AppHandle>) -> String {
    let home = python::get_hermes_home(app);
    let current_profile_file = home.join("active_profile"); // Sync with installer.ts
    if let Ok(content) = fs::read_to_string(current_profile_file) {
        let name = content.trim().to_string();
        if !name.is_empty() {
            return name;
        }
    }
    "default".to_string()
}

fn read_profile_config(profile_path: &Path) -> (String, String) {
    let config_file = profile_path.join("config.yaml");
    if let Ok(content) = fs::read_to_string(config_file) {
        let model = content.lines()
            .find(|l| l.trim().starts_with("default:"))
            .and_then(|l| l.split_once(':'))
            .map(|(_, v)| v.trim().trim_matches('"').trim_matches('\'').to_string())
            .unwrap_or_default();
        let provider = content.lines()
            .find(|l| l.trim().starts_with("provider:"))
            .and_then(|l| l.split_once(':'))
            .map(|(_, v)| v.trim().trim_matches('"').trim_matches('\'').to_string())
            .unwrap_or("auto".to_string());
        (model, provider)
    } else {
        ("".to_string(), "auto".to_string())
    }
}

fn count_skills(profile_path: &Path) -> u32 {
    let skills_dir = profile_path.join("skills");
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Ok(sub_entries) = fs::read_dir(entry.path()) {
                    for sub in sub_entries.flatten() {
                        if sub.path().join("SKILL.md").exists() {
                            count += 1;
                        }
                    }
                }
            }
        }
    }
    count
}

fn is_gateway_running(profile_path: &Path) -> bool {
    let pid_file = profile_path.join("gateway.pid");
    if let Ok(content) = fs::read_to_string(pid_file) {
        let raw = content.trim();
        let pid: Option<u32> = if raw.starts_with('{') {
            serde_json::from_str::<serde_json::Value>(raw).ok()
                .and_then(|v| v.get("pid").and_then(|p| p.as_u64()).map(|p| p as u32))
        } else {
            raw.parse().ok()
        };

        if let Some(pid) = pid {
            // signal 0 = existence check: returns Ok(()) if process is alive
            #[cfg(unix)]
            { return unsafe { libc::kill(pid as i32, 0) == 0 }; }
            #[cfg(windows)]
            { return std::process::Command::new("tasklist").args(["/FI", &format!("PID eq {}", pid)]).output().map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string())).unwrap_or(false); }
        }
    }
    false
}

pub fn list_profiles(app: Option<&AppHandle>) -> Vec<ProfileInfo> {
    let home = python::get_hermes_home(app);
    let active_name = get_active_profile_name(app);
    let mut profiles = Vec::new();

    // Default profile
    let (m, p) = read_profile_config(&home);
    profiles.push(ProfileInfo {
        name: "default".to_string(),
        path: home.to_string_lossy().to_string(),
        is_default: true,
        is_active: active_name == "default",
        model: m,
        provider: p,
        has_env: home.join(".env").exists(),
        has_soul: home.join("SOUL.md").exists(),
        skill_count: count_skills(&home),
        gateway_running: is_gateway_running(&home),
    });

    // Named profiles
    let profiles_dir = get_profiles_dir(app);
    if let Ok(entries) = fs::read_dir(profiles_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }
                
                let (m, p) = read_profile_config(&path);
                profiles.push(ProfileInfo {
                    name: name.clone(),
                    path: path.to_string_lossy().to_string(),
                    is_default: false,
                    is_active: active_name == name,
                    model: m,
                    provider: p,
                    has_env: path.join(".env").exists(),
                    has_soul: path.join("SOUL.md").exists(),
                    skill_count: count_skills(&path),
                    gateway_running: is_gateway_running(&path),
                });
            }
        }
    }

    profiles
}

pub fn create_profile(app: Option<&AppHandle>, name: &str, clone: bool) -> Result<(), String> {
    if name == "default" { return Err("Cannot create the default profile".to_string()); }
    
    let python_path = python::get_python_path(app);
    let repo_path = python::get_hermes_repo(app);
    let mut args = vec!["-m", "hermes_cli.entry", "profile", "create", name];
    if clone { args.push("--clone"); }

    let output = Command::new(python_path)
        .args(args)
        .current_dir(repo_path)
        .env("HERMES_HOME", python::get_hermes_home(app))
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn delete_profile(app: Option<&AppHandle>, name: &str) -> Result<(), String> {
    if name == "default" { return Err("Cannot delete the default profile".to_string()); }

    let python_path = python::get_python_path(app);
    let repo_path = python::get_hermes_repo(app);
    
    let output = Command::new(python_path)
        .args(["-m", "hermes_cli.entry", "profile", "delete", name, "--yes"])
        .current_dir(repo_path)
        .env("HERMES_HOME", python::get_hermes_home(app))
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn set_active_profile(app: Option<&AppHandle>, name: &str) -> Result<(), String> {
    let python_path = python::get_python_path(app);
    let repo_path = python::get_hermes_repo(app);
    
    let output = Command::new(python_path)
        .args(["-m", "hermes_cli.entry", "profile", "use", name])
        .current_dir(repo_path)
        .env("HERMES_HOME", python::get_hermes_home(app))
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
