use serde_json::{json, Value};
use tauri::{command, State, AppHandle};
use crate::AppState;
use std::fs;
use crate::python;
use crate::config_utils;
#[command]
pub async fn get_model_config(state: State<'_, AppState>, app: AppHandle, _profile: Option<String>) -> Result<Value, String> {
    // Try gateway first
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        if let Ok(val) = gw.call("model.options", json!({})).await {
            drop(gateway);
            // Normalize field names to camelCase
            let provider = val.get("provider").or_else(|| val.get("model_provider")).and_then(|v| v.as_str()).unwrap_or("auto");
            let model = val.get("model").or_else(|| val.get("model_default")).and_then(|v| v.as_str()).unwrap_or("");
            let base_url = val.get("base_url").or_else(|| val.get("baseUrl")).and_then(|v| v.as_str()).unwrap_or("");
            return Ok(json!({ "provider": provider, "model": model, "baseUrl": base_url }));
        }
    }
    drop(gateway);

    // Fallback: read from config.yaml
    let config_path = python::get_hermes_home_with_profile(Some(&app), _profile).join("config.yaml");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            let provider = config_utils::get_yaml_path(&content, "model.provider").unwrap_or_else(|| "auto".to_string());
            let model = config_utils::get_yaml_path(&content, "model.default").unwrap_or_default();
            let base_url = config_utils::get_yaml_path(&content, "model.base_url").unwrap_or_default();
            return Ok(json!({ "provider": provider, "model": model, "baseUrl": base_url }));
        }
    }
    Ok(json!({ "provider": "auto", "model": "", "baseUrl": "" }))
}

#[command]
pub async fn set_model_config(state: State<'_, AppState>, provider: String, model: String, base_url: String, max_tokens: Option<i64>, _profile: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    
    let mut config = json!({ 
        "model.provider": provider, 
        "model.default": model, 
        "model.base_url": base_url 
    });
    if let Some(mt) = max_tokens {
        config["model.max_tokens"] = json!(mt);
    }
    
    gw.call("config.set", config).await.map_err(|e| e.to_string())?;

    if let Ok(recent) = gw.call("session.most_recent", json!({})).await {
        if let Some(sid) = recent.get("session_id").and_then(|v| v.as_str()) {
             let _ = gw.call("slash.exec", json!({ "session_id": sid, "command": format!("/model {}", model) })).await;
        }
    }
    Ok(json!(true))
}

#[command]
pub async fn get_env(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let env_path = python::get_hermes_home_with_profile(Some(&app), profile).join(".env");
    let env = config_utils::read_env(&env_path);
    Ok(json!(env))
}

#[command]
pub async fn set_env(app: AppHandle, key: String, value: String, profile: Option<String>) -> Result<bool, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }
    let env_path = home.join(".env");
    config_utils::set_env_value(&env_path, &key, &value).map(|_| true).map_err(|e| e.to_string())
}

#[command]
pub async fn get_config(app: AppHandle, key: String, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile).join("config.yaml");
    if !config_path.exists() {
        return Ok(Value::Null);
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let val = config_utils::get_yaml_path(&content, &key);
    Ok(json!(val))
}

#[command]
pub async fn set_config(app: AppHandle, key: String, value: String, profile: Option<String>) -> Result<bool, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }
    let config_path = home.join("config.yaml");

    let content = if config_path.exists() {
        fs::read_to_string(&config_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    
    let new_content = config_utils::set_yaml_value(&content, &key, &value);
    fs::write(&config_path, new_content).map(|_| true).map_err(|e| e.to_string())
}

#[command]
pub async fn get_hermes_home(app: AppHandle, _profile: Option<String>) -> Result<String, String> {
    Ok(python::get_hermes_home(Some(&app)).to_string_lossy().to_string())
}

#[command]
pub async fn get_model_aliases(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile).join("config.yaml");
    if !config_path.exists() { return Ok(json!([])); }
    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    Ok(json!(config_utils::get_model_aliases(&content)))
}

#[command]
pub async fn is_remote_mode(app: AppHandle) -> Result<Value, String> {
    let conn = config_utils::get_connection_config(&app);
    Ok(json!(conn.mode == "remote" || conn.mode == "ssh"))
}

#[command]
pub async fn is_remote_only_mode(app: AppHandle) -> Result<Value, String> {
    let conn = config_utils::get_connection_config(&app);
    Ok(json!(conn.mode == "remote"))
}

#[command]
pub async fn get_connection_config(app: AppHandle) -> Result<Value, String> {
    let conn = config_utils::get_connection_config(&app);
    let api_key_len = conn.api_key.len();
    let has_api_key = api_key_len > 0;
    Ok(json!({
        "mode": conn.mode,
        "remoteUrl": conn.remote_url,
        "hasApiKey": has_api_key,
        "apiKeyLength": api_key_len,
        "ssh": {
            "host": conn.ssh.host,
            "port": conn.ssh.port,
            "username": conn.ssh.username,
            "keyPath": conn.ssh.key_path,
            "remotePort": conn.ssh.remote_port,
            "localPort": conn.ssh.local_port,
        }
    }))
}

#[command]
pub async fn set_connection_config(app: AppHandle, mode: String, remote_url: String, api_key: String) -> Result<bool, String> {
    let mut data = config_utils::read_desktop_config(&app);
    data["connectionMode"] = json!(mode);
    data["remoteUrl"] = json!(remote_url);
    data["remoteApiKey"] = json!(api_key);
    
    let home = python::get_hermes_home(Some(&app));
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create hermes home: {}", e))?;
    }
    let config_file = home.join("desktop.json");
    fs::write(config_file, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[command]
pub async fn set_ssh_config(app: AppHandle, host: String, port: u16, username: String, key_path: String, remote_port: u16, local_port: u16) -> Result<bool, String> {
    let mut data = config_utils::read_desktop_config(&app);
    data["sshConfig"] = json!({
        "host": host,
        "port": port,
        "username": username,
        "keyPath": key_path,
        "remotePort": remote_port,
        "localPort": local_port,
    });
    let home = python::get_hermes_home(Some(&app));
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create hermes home: {}", e))?;
    }
    let config_file = home.join("desktop.json");
    fs::write(config_file, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[command]
pub async fn test_remote_connection(url: String, api_key: String) -> Result<bool, String> {
    if url.trim().is_empty() {
        return Err("URL is empty".to_string());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are allowed".to_string());
    }
    let health_url = format!("{}/health", url.trim_end_matches('/'));
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::process::Command::new("curl")
            .args(["-sf", "-o", "/dev/null", "-w", "%{http_code}",
                   "--max-time", "10",
                   "--proto", "=https,=http",
                   "-H", &format!("Authorization: Bearer {}", api_key),
                   &health_url])
            .output()
    )
    .await
    .map_err(|_| "Connection timed out".to_string())?
    .map_err(|e| format!("curl failed: {}", e))?;
    let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(code == "200")
}

#[command]
pub async fn test_ssh_connection(
    host: String,
    port: u16,
    username: String,
    key_path: String,
    _remote_port: Option<u16>
) -> Result<bool, String> {
    use tokio::process::Command;
    use std::process::Stdio;
    let mut child = Command::new("ssh")
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-p", &port.to_string(),
            "-i", &key_path,
            &format!("{}@{}", username, host),
            "true"
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
        
    let status = child.wait().await.map_err(|e| e.to_string())?;
    Ok(status.success())
}

#[command]
pub async fn is_ssh_tunnel_active(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.ssh_tunnel.is_active().await)
}

#[command]
pub async fn start_ssh_tunnel(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<bool, String> {
    let conn = crate::config_utils::get_connection_config(&app);
    let ssh = &conn.ssh;
    let args = vec![
        "-N".to_string(),
        "-L".to_string(), format!("{}:127.0.0.1:{}", ssh.local_port, ssh.remote_port),
        "-p".to_string(), ssh.port.to_string(),
        "-i".to_string(), ssh.key_path.clone(),
        "-o".to_string(), "StrictHostKeyChecking=accept-new".to_string(),
        "-o".to_string(), "BatchMode=yes".to_string(),
        "-o".to_string(), "ExitOnForwardFailure=yes".to_string(),
        "-o".to_string(), "ServerAliveInterval=30".to_string(),
        "-o".to_string(), "ServerAliveCountMax=3".to_string(),
        format!("{}@{}", ssh.username, ssh.host)
    ];
    state.ssh_tunnel.start(args).await.map(|_| true).map_err(|e| e.to_string())
}

#[command]
pub async fn stop_ssh_tunnel(state: State<'_, AppState>) -> Result<bool, String> {
    state.ssh_tunnel.stop().await;
    Ok(true)
}

#[command]
pub async fn read_config_yaml(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile.clone()).join("config.yaml");
    eprintln!("[config_yaml] Reading from {:?} (profile={:?})", config_path, profile);
    let path_str = config_path.to_string_lossy().to_string();
    match fs::read_to_string(&config_path) {
        Ok(content) => {
            eprintln!("[config_yaml] Read {} bytes", content.len());
            Ok(json!({ "content": content, "path": path_str }))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            eprintln!("[config_yaml] File not found");
            Ok(json!({ "content": "", "path": path_str }))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn write_config_yaml(app: AppHandle, content: String, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }
    let config_path = home.join("config.yaml");
    fs::write(&config_path, &content).map_err(|e| e.to_string())?;
    Ok(json!(true))
}

#[command]
pub async fn get_platform_enabled(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile).join("config.yaml");
    if !config_path.exists() { return Ok(json!({})); }
    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let enabled = config_utils::parse_enabled_toolsets(&content);
    let mut result = serde_json::Map::new();
    for key in &["web", "browser", "terminal", "file", "code_execution", "vision", "image_gen", "tts", "memory", "skills", "cronjob"] {
        result.insert(key.to_string(), json!(enabled.contains(*key)));
    }
    Ok(json!(result))
}

#[command]
pub async fn set_platform_enabled(app: AppHandle, platform: String, enabled: bool, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(Some(&app), profile);
    if !home.exists() {
        fs::create_dir_all(&home).map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }
    let config_path = home.join("config.yaml");
    
    let content = if config_path.exists() {
        fs::read_to_string(&config_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };

    if let Some(new_content) = config_utils::set_toolsets_enabled(&content, &platform, enabled) {
        fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
        Ok(json!(true))
    } else {
        Ok(json!(false))
    }
}

#[command]
pub async fn get_routing_config(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile).join("config.yaml");
    if !config_path.exists() {
        return Ok(json!({
            "defaultModel": null, "defaultProvider": null, "defaultBaseUrl": null,
            "provider": null, "baseUrl": null,
            "maxTokens": null, "fallbacks": [], "fallbackProviders": []
        }));
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let doc: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| format!("YAML parse error: {}", e))?;

    let model = &doc["model"];
    let default_model = model["default"].as_str();
    let provider = model["provider"].as_str();
    let base_url = model["base_url"].as_str();
    let max_tokens = model["max_tokens"].as_i64();

    let mut fallbacks = Vec::new();
    if let serde_yaml::Value::Sequence(seq) = &doc["fallback_providers"] {
        for item in seq {
            fallbacks.push(json!({
                "model": item["model"].as_str().unwrap_or(""),
                "provider": item["provider"].as_str().unwrap_or(""),
            }));
        }
    }

    Ok(json!({
        "defaultModel": default_model,
        "defaultProvider": provider,
        "defaultBaseUrl": base_url,
        "provider": provider,
        "baseUrl": base_url,
        "maxTokens": max_tokens,
        "fallbacks": fallbacks,
        "fallbackProviders": fallbacks,
    }))
}
