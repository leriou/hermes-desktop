use serde_json::{json, Value};
use tauri::{command, State, AppHandle, Emitter, Manager};
use crate::AppState;
use crate::tui_gateway::TuiGateway;
use std::fs;
use crate::python;
use crate::config_utils;
use std::sync::Arc;
use std::path::Path;
use tokio::io::AsyncBufReadExt;
use super::utils::*;

#[command]
pub async fn check_install(app: AppHandle) -> Result<Value, String> {
    let _hermes_home = python::get_hermes_home(Some(&app));
    let conn = config_utils::get_connection_config(&app);
    if conn.mode == "remote" && !conn.remote_url.is_empty() {
        return Ok(json!({
            "installed": true,
            "configured": true,
            "hasApiKey": true,
            "verified": true,
            "activeProfile": "default"
        }));
    }

    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    
    // Fast path: if .hermes exists and components look OK
    let installed = python_path.exists() && repo_path.exists();
    
    Ok(json!({
        "installed": installed,
        "configured": installed,
        "hasApiKey": true, // Bypass key check for now
        "verified": installed,
        "activeProfile": "default"
    }))
}

#[command]
pub async fn verify_install(state: State<'_, AppState>, app: AppHandle) -> Result<bool, String> {
    // 1. Check if gateway is already running
    {
        let gateway_guard = state.gateway.lock().await;
        if let Some(gw) = gateway_guard.as_ref() {
            if gw.is_running().await { return Ok(true); }
        }
    }
    
    // 2. Lenient check: if files exist, consider it verified
    let hermes_home = python::get_hermes_home(Some(&app));
    let python_path = python::get_python_path(Some(&app));
    if hermes_home.exists() && python_path.exists() {
        return Ok(true);
    }

    // 3. Last ditch: try to start the gateway
    let gw = Arc::new(TuiGateway::new(app, None));
    match gw.clone().start().await {
        Ok(_) => {
            let mut gateway_guard = state.gateway.lock().await;
            *gateway_guard = Some(gw);
            Ok(true)
        }
        Err(_) => Ok(false)
    }
}

#[command]
pub async fn inspect_install_target(app: AppHandle) -> Result<Value, String> {
    let hermes_home = python::get_hermes_home(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    
    let mut state = "fresh";
    if repo_path.exists() {
        state = "update";
    } else if hermes_home.exists() {
        state = "replace";
    }

    Ok(json!({
        "hermesHome": hermes_home.to_string_lossy(),
        "repoPath": repo_path.to_string_lossy(),
        "state": state
    }))
}

#[command]
pub async fn validate_hermes_home(dir: String) -> Result<bool, String> {
    let path = Path::new(&dir);
    if !path.exists() { return Ok(false); }
    let repo = path.join("hermes-agent");
    let has_repo = repo.exists();
    let has_config = path.join("config.yaml").exists() || path.join("active_profile").exists();
    Ok(has_repo || has_config)
}

#[command]
pub async fn adopt_hermes_home(app: AppHandle, dir: String) -> Result<bool, String> {
    let path = Path::new(&dir);
    if !path.exists() { return Ok(false); }
    let user_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !user_data.exists() {
        fs::create_dir_all(&user_data).map_err(|e| e.to_string())?;
    }
    let override_file = user_data.join("hermes-home.json");
    let config = json!({ "hermesHome": dir });
    fs::write(override_file, serde_json::to_string(&config).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[command] pub async fn quit_app(app: AppHandle) -> Result<Value, String> { app.exit(0); Ok(Value::Null) }

#[command]
pub async fn get_hermes_version(app: AppHandle) -> Result<Value, String> {
    let raw_version = {
        let mut found = None;
        let version_file = python::get_hermes_repo(Some(&app)).join("VERSION");
        if let Ok(content) = fs::read_to_string(version_file) {
            let v = content.trim().to_string();
            if !v.is_empty() { found = Some(v); }
        }
        if found.is_none() {
            let version_file = python::get_hermes_repo(Some(&app)).join("hermes_agent").join("VERSION");
            if let Ok(content) = fs::read_to_string(version_file) {
                let v = content.trim().to_string();
                if !v.is_empty() { found = Some(v); }
            }
        }
        if found.is_none() {
            let pyproject = python::get_hermes_repo(Some(&app)).join("pyproject.toml");
            if let Ok(content) = fs::read_to_string(pyproject) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.starts_with("version") && line.contains('=') {
                        let v = line.split('=').nth(1).unwrap_or("").trim().trim_matches('"').trim_matches('\'');
                        if !v.is_empty() {
                            found = Some(v.to_string());
                            break;
                        }
                    }
                }
            }
        }
        found.unwrap_or_else(|| "0.0.0".to_string())
    };

    let python_path = python::get_python_path(Some(&app));
    
    // 1. Python version
    let py_ver = match tokio::process::Command::new(&python_path)
        .arg("--version")
        .output()
        .await {
            Ok(output) => {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if s.starts_with("Python ") {
                    s.split_whitespace().nth(1).unwrap_or("—").to_string()
                } else {
                    let s_err = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    if s_err.starts_with("Python ") {
                        s_err.split_whitespace().nth(1).unwrap_or("—").to_string()
                    } else {
                        "—".to_string()
                    }
                }
            }
            Err(_) => "—".to_string(),
        };

    // 2. OpenAI SDK version
    let sdk_ver = match tokio::process::Command::new(&python_path)
        .args(["-c", "import openai; print(openai.__version__)"])
        .output()
        .await {
            Ok(output) => {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() && !s.contains("Error") {
                    s
                } else {
                    "—".to_string()
                }
            }
            Err(_) => "—".to_string(),
        };

    // 3. Date
    let date_str = {
        let repo_path = python::get_hermes_repo(Some(&app));
        let pyproject_path = repo_path.join("pyproject.toml");
        
        #[cfg(target_os = "macos")]
        {
            if let Ok(out) = std::process::Command::new("stat")
                .args(["-f", "%Sm", "-t", "%Y.%m.%d", &pyproject_path.to_string_lossy()])
                .output() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() { s } else { "2026.05.26".to_string() }
                } else {
                    "2026.05.26".to_string()
                }
        }
        #[cfg(not(target_os = "macos"))]
        {
            "2026.05.26".to_string()
        }
    };

    let full_info = format!("Hermes Agent v{} ({}) Python: {} OpenAI SDK: {}", raw_version, date_str, py_ver, sdk_ver);
    Ok(json!(full_info))
}

#[command]
pub async fn refresh_hermes_version(app: AppHandle) -> Result<Value, String> {
    get_hermes_version(app).await
}

#[command]
pub async fn get_build_info(app: AppHandle) -> Result<Value, String> {
    let version = app.package_info().version.to_string();
    let commit = env!("GIT_COMMIT").to_string();
    let build_ts = env!("BUILD_TIME").to_string();
    let build_time_str = build_ts.parse::<u64>()
        .map(|ts| {
            let secs = ts;
            let days = secs / 86400;
            let time = secs % 86400;
            let hours = time / 3600;
            let minutes = (time % 3600) / 60;
            format!("2026-01-01 +{}d {:02}:{:02} (approx)", days, hours, minutes)
        })
        .unwrap_or_else(|_| "unknown".to_string());
    let hermes_home = python::get_hermes_home(Some(&app));
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let app_data = app.path().app_data_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    Ok(json!({
        "version": version,
        "gitCommit": commit,
        "buildTimestamp": build_ts,
        "buildTimeDisplay": build_time_str,
        "hermesHome": hermes_home.to_string_lossy(),
        "pythonPath": python_path.to_string_lossy(),
        "repoPath": repo_path.to_string_lossy(),
        "appDataDir": app_data,
    }))
}

#[command]
pub async fn run_hermes_doctor(app: AppHandle) -> Result<Value, String> {
    run_hermes_cli(&app, &["doctor"]).await.map(|s| json!(s))
}

#[command]
pub async fn run_hermes_update(app: AppHandle) -> Result<Value, String> {
    app.emit("installprogress", json!({
        "step": 1, "totalSteps": 1,
        "title": "Updating Hermes Agent",
        "detail": "Running hermes update...",
        "log": "Starting update...\n"
    })).map_err(|e| e.to_string())?;
    match run_hermes_cli(&app, &["update"]).await {
        Ok(stdout) => {
            app.emit("installprogress", json!({
                "step": 1, "totalSteps": 1,
                "title": "Update Complete",
                "detail": "Hermes Agent updated successfully",
                "log": stdout
            })).ok();
            Ok(json!({ "success": true }))
        }
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[command]
pub async fn get_locale(app: AppHandle) -> Result<Value, String> {
    let data = config_utils::read_desktop_config(&app);
    let locale = data.get("locale").and_then(|v| v.as_str()).unwrap_or("en");
    Ok(json!(locale))
}

#[command]
pub async fn set_locale(app: AppHandle, locale: String) -> Result<Value, String> {
    let mut data = config_utils::read_desktop_config(&app);
    data["locale"] = json!(locale);
    let config_file = python::get_hermes_home(Some(&app)).join("desktop.json");
    fs::write(config_file, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(json!(locale))
}

#[command]
pub async fn get_credential_pool(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    let auth_file = home.join("auth.json");
    if !auth_file.exists() { return Ok(json!({})); }
    let content = fs::read_to_string(auth_file).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));
    let pool = parsed.get("credential_pool").cloned().unwrap_or(json!({}));
    Ok(pool)
}

#[command]
pub async fn set_credential_pool(app: AppHandle, provider: String, entries: Value, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    let auth_file = home.join("auth.json");
    let mut store: Value = if auth_file.exists() {
        let content = fs::read_to_string(&auth_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if !store.get("credential_pool").is_some() || !store["credential_pool"].is_object() {
        store["credential_pool"] = json!({});
    }
    store["credential_pool"].as_object_mut().unwrap().insert(provider, entries);
    fs::write(&auth_file, serde_json::to_string_pretty(&store).unwrap()).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[command] pub async fn check_for_updates() -> Result<Value, String> { Ok(Value::Null) }
#[command] pub async fn download_update() -> Result<Value, String> { Ok(Value::Null) }
#[command] pub async fn install_update() -> Result<Value, String> { Ok(Value::Null) }

#[command] pub async fn get_app_version(app: AppHandle) -> Result<Value, String> { Ok(json!(app.package_info().version.to_string())) }

#[command]
pub async fn open_external(app: AppHandle, url: String) -> Result<Value, String> {
    use tauri_plugin_shell::ShellExt;
    let allowed = ["https", "http", "mailto", "tel"];
    let scheme = url.split(':').next().unwrap_or("");
    if !allowed.contains(&scheme) {
        return Err(format!("URL scheme '{}' is not allowed", scheme));
    }
    app.shell().open(url, None).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[command]
pub async fn select_folder(app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()).unwrap_or_default());
    });
    let path = rx.recv().map_err(|e| e.to_string())?;
    if path.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(json!(path))
    }
}

#[command]
pub async fn select_hermes_folder(app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()).unwrap_or_default());
    });
    let path = rx.recv().map_err(|e| e.to_string())?;
    if path.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(json!(path))
    }
}

#[command]
pub async fn oauth_login(app: AppHandle, provider: String, _profile: Option<String>) -> Result<Value, String> {
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let hermes_home = python::get_hermes_home(Some(&app));
    if !python_path.exists() {
        return Ok(json!({ "success": false, "error": "Python not found" }));
    }

    app.emit("oauthloginprogress", "Starting OAuth login...\n").map_err(|e| e.to_string())?;

    let mut child = tokio::process::Command::new(&python_path)
        .args(["-m", "hermes_cli.main", "auth", "add", &provider, "--type", "oauth"])
        .current_dir(&repo_path)
        .env("HERMES_HOME", &hermes_home)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run auth: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = tokio::io::BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        app.emit("oauthloginprogress", format!("{}\n", &line)).ok();
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() {
        app.emit("oauthloginprogress", "OAuth login complete.\n").ok();
        Ok(json!({ "success": true }))
    } else {
        app.emit("oauthloginprogress", "OAuth login failed.\n").ok();
        Ok(json!({ "success": false, "error": "OAuth login failed".to_string() }))
    }
}

#[command]
pub async fn cancel_oauth_login() -> Result<Value, String> {
    // TODO: implement OAuth cancel (kill running auth process)
    Ok(json!(true))
}

#[command]
pub async fn start_install(app: AppHandle) -> Result<Value, String> {
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    if !python_path.exists() {
        return Ok(json!({ "success": false, "error": "Python not found" }));
    }

    let stage_markers: Vec<(regex::Regex, u32, String)> = vec![
        (regex::Regex::new(r"(?i)Checking (for )?(git|uv|python|node|ripgrep|ffmpeg)").unwrap(), 1, "Checking prerequisites".to_string()),
        (regex::Regex::new(r"(?i)Installing uv|uv found|uv installed").unwrap(), 2, "Setting up package manager".to_string()),
        (regex::Regex::new(r"(?i)Installing Python|Python .* found|Python installed").unwrap(), 3, "Setting up Python".to_string()),
        (regex::Regex::new(r"(?i)Cloning|cloning|Updating.*repository|Repository|Installing to .*hermes-agent|Downloading PortableGit").unwrap(), 4, "Downloading Hermes Agent".to_string()),
        (regex::Regex::new(r"(?i)Creating virtual|virtual environment|uv venv|\\bvenv\\b").unwrap(), 5, "Creating Python environment".to_string()),
        (regex::Regex::new(r"(?i)pip install|Installing.*packages|dependencies|Trying tier|Resolving|Main package installed").unwrap(), 6, "Installing dependencies".to_string()),
        (regex::Regex::new(r"(?i)Installation complete|hermes command ready|Configuration directory ready|Hermes (installation )?(finished|is ready)").unwrap(), 7, "Finishing setup".to_string()),
    ];

    let mut child = tokio::process::Command::new(&python_path)
        .args(["-m", "hermes_cli.main", "install"])
        .current_dir(&repo_path)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Install failed: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = tokio::io::BufReader::new(stdout).lines();

    let total_steps = 7u32;
    let mut current_step = 1u32;
    let mut current_title = "Starting installation...".to_string();
    let mut log = String::new();

    app.emit("installprogress", json!({
        "step": current_step, "totalSteps": total_steps,
        "title": current_title,
        "detail": "Running hermes install...",
        "log": "Starting installation...\n"
    })).map_err(|e| e.to_string())?;

    while let Ok(Some(line)) = reader.next_line().await {
        log.push_str(&line);
        log.push('\n');

        for (re, step, title) in &stage_markers {
            if re.is_match(&line) && *step >= current_step {
                current_step = *step;
                current_title = title.clone();
                break;
            }
        }

        app.emit("installprogress", json!({
            "step": current_step, "totalSteps": total_steps,
            "title": current_title,
            "detail": line.chars().take(120).collect::<String>(),
            "log": &log
        })).ok();
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() {
        app.emit("installprogress", json!({
            "step": total_steps, "totalSteps": total_steps,
            "title": "Installation Complete",
            "detail": "Hermes Agent installed successfully",
            "log": &log
        })).ok();
        Ok(json!({ "success": true }))
    } else {
        app.emit("installprogress", json!({
            "step": total_steps, "totalSteps": total_steps,
            "title": "Installation Failed",
            "detail": "Installation did not complete successfully",
            "log": &log
        })).ok();
        Ok(json!({ "success": false, "error": "Installation failed".to_string() }))
    }
}
