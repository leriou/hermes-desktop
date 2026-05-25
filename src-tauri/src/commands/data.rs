use serde_json::{json, Value};
use tauri::{command, State, AppHandle};
use crate::AppState;
use std::fs;
use crate::python;
use crate::profiles;
use crate::memory;
use crate::config_utils;
use super::utils::*;

#[command]
pub async fn list_sessions(state: State<'_, AppState>, app: AppHandle, profile: Option<String>, limit: Option<u32>, offset: Option<u32>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = match gateway.as_ref() {
        Some(g) => g,
        None => return crate::session_utils::list_sessions(Some(&app), profile, limit, offset),
    };
    match gw.call("session.list", json!({ "limit": limit, "offset": offset })).await {
        Ok(val) => Ok(json!(snake_to_camel_sessions(val))),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn get_session_messages(_state: State<'_, AppState>, app: AppHandle, session_id: String, profile: Option<String>) -> Result<Value, String> {
    crate::session_utils::get_session_messages(Some(&app), &session_id, profile)
}

#[command]
pub async fn delete_session(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.delete", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command]
pub async fn list_cached_sessions(state: State<'_, AppState>, app: AppHandle, profile: Option<String>, limit: Option<u32>, offset: Option<u32>) -> Result<Value, String> {
    let lim = limit.unwrap_or(1000) as usize;
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        if gw.is_running().await {
            if let Ok(sessions) = gw.call("session.list", json!({ "limit": lim, "offset": offset })).await {
                let mut list = snake_to_camel_sessions(sessions);
                list = list.into_iter().take(lim).collect();
                eprintln!("[sessions:cached] Gateway returned {} sessions", list.len());
                return Ok(json!(list));
            }
        }
    }
    drop(gateway);
    eprintln!("[sessions:cached] Gateway not running, using CLI fallback");
    crate::session_utils::list_sessions(Some(&app), profile, limit, offset)
}

#[command]
pub async fn sync_session_cache(state: State<'_, AppState>, app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        if gw.is_running().await {
            if let Ok(sessions) = gw.call("session.list", json!({ "limit": 1000 })).await {
                let list = snake_to_camel_sessions(sessions);
                return Ok(json!(list));
            }
        }
    }
    drop(gateway);
    crate::session_utils::list_sessions(Some(&app), profile, Some(1000), None)
}

#[command]
pub async fn update_session_title(state: State<'_, AppState>, session_id: String, title: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        let _ = gw.call("session.rename", json!({ "session_id": session_id, "title": title })).await;
    }
    Ok(json!({ "success": true }))
}

#[command]
pub async fn search_sessions(state: State<'_, AppState>, app: AppHandle, query: String, limit: Option<u32>, profile: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = match gateway.as_ref() {
        Some(g) => g,
        None => return crate::session_utils::search_sessions(Some(&app), &query, limit, profile),
    };
    match gw.call("session.list", json!({ "query": query, "limit": limit, "action": "search" })).await {
        Ok(val) => {
            let sessions = if let Some(arr) = val.get("sessions").and_then(|v| v.as_array()) {
                arr.clone()
            } else if let Some(arr) = val.as_array() {
                arr.clone()
            } else {
                return Ok(json!([]));
            };
            let results: Vec<Value> = sessions.into_iter().map(|s| {
                let obj = s.as_object().cloned().unwrap_or_default();
                let id = obj.get("id").or_else(|| obj.get("session_id")).and_then(|v| v.as_str()).unwrap_or("");
                json!({
                    "sessionId": id,
                    "title": obj.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    "startedAt": obj.get("started_at").or_else(|| obj.get("startedAt")).and_then(|v| v.as_u64()).unwrap_or(0),
                    "source": obj.get("source").and_then(|v| v.as_str()).unwrap_or("local"),
                    "messageCount": obj.get("message_count").or_else(|| obj.get("messageCount")).and_then(|v| v.as_u64()).unwrap_or(0),
                    "model": obj.get("model").and_then(|v| v.as_str()).unwrap_or(""),
                    "snippet": obj.get("snippet").and_then(|v| v.as_str()).unwrap_or(""),
                })
            }).collect();
            Ok(json!(results))
        }
        Err(_) => crate::session_utils::search_sessions(Some(&app), &query, limit, profile),
    }
}

#[command]
pub async fn list_profiles(app: AppHandle) -> Result<Value, String> {
    Ok(json!(profiles::list_profiles(Some(&app))))
}

#[command]
pub async fn create_profile(app: AppHandle, name: String, clone: bool) -> Result<Value, String> {
    profiles::create_profile(Some(&app), &name, clone).map(|_| json!({"success": true})).map_err(|e| e)
}

#[command]
pub async fn delete_profile(app: AppHandle, name: String) -> Result<Value, String> {
    profiles::delete_profile(Some(&app), &name).map(|_| json!({"success": true})).map_err(|e| e)
}

#[command]
pub async fn set_active_profile(app: AppHandle, name: String) -> Result<Value, String> {
    profiles::set_active_profile(Some(&app), &name).map(|_| json!({"success": true})).map_err(|e| e)
}

#[command]
pub async fn read_memory(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    memory::read_memory(Some(&app), profile)
}

#[command]
pub async fn add_memory_entry(app: AppHandle, content: String, profile: Option<String>) -> Result<Value, String> {
    let entry = memory::add_memory_entry(Some(&app), profile, content)?;
    Ok(json!({ "success": true, "entry": entry }))
}

#[command]
pub async fn update_memory_entry(app: AppHandle, index: u64, content: String, profile: Option<String>) -> Result<Value, String> {
    memory::update_memory_entry(Some(&app), profile, index as usize, content)?;
    Ok(json!({ "success": true }))
}

#[command]
pub async fn remove_memory_entry(app: AppHandle, index: u64, profile: Option<String>) -> Result<Value, String> {
    memory::remove_memory_entry(Some(&app), profile, index as usize)?;
    Ok(json!({ "success": true }))
}

#[command]
pub async fn write_user_profile(app: AppHandle, content: String, profile: Option<String>) -> Result<Value, String> {
    memory::write_user_profile(Some(&app), profile, content)?;
    Ok(json!({ "success": true }))
}

#[command]
pub async fn write_memory(app: AppHandle, content: String, profile: Option<String>) -> Result<Value, String> {
    memory::write_memory(Some(&app), profile, content)?;
    Ok(json!({ "success": true }))
}

#[command]
pub async fn read_soul(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::soul_utils::read_soul(Some(&app), profile)
}

#[command]
pub async fn write_soul(app: AppHandle, content: String, profile: Option<String>) -> Result<Value, String> {
    crate::soul_utils::write_soul(Some(&app), content, profile)
}

#[command]
pub async fn reset_soul(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::soul_utils::reset_soul(Some(&app), profile)
}

#[command]
pub async fn list_models(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::model_utils::list_models(Some(&app), profile)
}

#[command]
pub async fn list_templates(_app: AppHandle) -> Result<Value, String> {
    let templates = serde_json::json!([
        {"name":"Claude Opus 4","provider":"anthropic","model":"claude-opus-4-20250918","baseUrl":"","tags":["flagship"]},
        {"name":"Claude Sonnet 4","provider":"anthropic","model":"claude-sonnet-4-20250514","baseUrl":"","tags":["recommended"]},
        {"name":"Claude Haiku 3.5","provider":"anthropic","model":"claude-3-5-haiku-20241022","baseUrl":"","tags":["fast","cheap"]},
        {"name":"GPT-4.1","provider":"openai","model":"gpt-4.1","baseUrl":"","tags":["recommended"]},
        {"name":"GPT-4.1 Mini","provider":"openai","model":"gpt-4.1-mini","baseUrl":"","tags":["fast"]},
        {"name":"GPT-4.1 Nano","provider":"openai","model":"gpt-4.1-nano","baseUrl":"","tags":["fast","cheap"]},
        {"name":"o3","provider":"openai","model":"o3","baseUrl":"","tags":["reasoning"]},
        {"name":"o4-mini","provider":"openai","model":"o4-mini","baseUrl":"","tags":["reasoning","fast"]},
        {"name":"Gemini 2.5 Pro","provider":"google","model":"gemini-2.5-pro","baseUrl":"","tags":["recommended"]},
        {"name":"Gemini 2.5 Flash","provider":"google","model":"gemini-2.5-flash","baseUrl":"","tags":["fast"]},
        {"name":"Grok 3","provider":"xai","model":"grok-3","baseUrl":"","tags":[]},
        {"name":"DeepSeek R1","provider":"deepseek","model":"deepseek-reasoner","baseUrl":"","tags":["reasoning","cheap"]},
        {"name":"DeepSeek V3","provider":"deepseek","model":"deepseek-chat","baseUrl":"","tags":["recommended","cheap"]},
        {"name":"Qwen 3 235B","provider":"qwen","model":"qwen3-235b-a22b","baseUrl":"","tags":["reasoning"]},
        {"name":"GLM-4.5","provider":"zai","model":"glm-4.5","baseUrl":"","tags":[]},
        {"name":"Claude Sonnet 4 (OpenRouter)","provider":"openrouter","model":"anthropic/claude-sonnet-4-20250514","baseUrl":"","tags":["recommended"]},
        {"name":"GPT-4.1 (OpenRouter)","provider":"openrouter","model":"openai/gpt-4.1","baseUrl":"","tags":["recommended"]},
    ]);
    Ok(templates)
}

#[command]
pub async fn add_model(app: AppHandle, name: String, provider: String, model: String, base_url: String, alias: Option<String>, profile: Option<String>) -> Result<Value, String> {
    crate::model_utils::add_model(Some(&app), name, provider, model, base_url, alias, profile)
}

#[command]
pub async fn remove_model(app: AppHandle, id: String, profile: Option<String>) -> Result<Value, String> {
    crate::model_utils::remove_model(Some(&app), id, profile)
}

#[command]
pub async fn update_model(app: AppHandle, id: String, fields: Value, profile: Option<String>) -> Result<Value, String> {
    crate::model_utils::update_model(Some(&app), id, fields, profile)
}

#[command]
pub async fn run_hermes_backup(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    match run_hermes_cli(&app, &["backup"]) {
        Ok(stdout) => Ok(json!({ "success": true, "path": stdout.trim() })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[command]
pub async fn run_hermes_import(app: AppHandle, archive_path: String, _profile: Option<String>) -> Result<Value, String> {
    match run_hermes_cli(&app, &["import", &archive_path]) {
        Ok(_) => Ok(json!({ "success": true })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[command]
pub async fn run_hermes_dump(app: AppHandle) -> Result<Value, String> {
    run_hermes_cli(&app, &["dump"]).map(|s| json!(s))
}

#[command]
pub async fn discover_memory_providers(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let repo_path = python::get_hermes_repo(Some(&app));
    let plugins_dir = repo_path.join("plugins").join("memory");
    if !plugins_dir.exists() { return Ok(json!([])); }

    // Read active provider from config.yaml
    let hermes_home = python::get_hermes_home_with_profile(Some(&app), profile);
    let active_provider = if let Ok(content) = fs::read_to_string(hermes_home.join("config.yaml")) {
        config_utils::get_yaml_path(&content, "memory.provider").unwrap_or_default()
    } else { String::new() };

    let mut providers = Vec::new();
    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('_') { continue; }
                let installed = path.join("__init__.py").exists();
                providers.push(json!({
                    "name": name,
                    "description": name,
                    "installed": installed,
                    "active": name == active_provider,
                    "envVars": []
                }));
            }
        }
    }
    Ok(json!(providers))
}

#[command]
pub async fn list_mcp_servers(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile).join("config.yaml");
    if !config_path.exists() { return Ok(json!([])); }
    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    Ok(json!(config_utils::list_mcp_servers(&content)))
}

#[command]
pub async fn read_logs(app: AppHandle, log_file: Option<String>, lines: Option<usize>) -> Result<Value, String> {
    let home = python::get_hermes_home(Some(&app));
    let logs_dir = home.join("logs");
    let allowed = ["agent.log", "errors.log", "gateway.log"];
    let file_name = log_file.as_deref().map(|f| if allowed.contains(&f) { f } else { "agent.log" }).unwrap_or("agent.log");
    let full_path = logs_dir.join(file_name);
    let path_str = full_path.to_string_lossy().to_string();
    if !full_path.exists() { return Ok(json!({ "content": "", "path": path_str })); }
    match fs::read_to_string(&full_path) {
        Ok(content) => {
            let n = lines.unwrap_or(200);
            let all_lines: Vec<&str> = content.lines().collect();
            let tail: Vec<&str> = all_lines.iter().rev().take(n).map(|s| *s).collect::<Vec<_>>().into_iter().rev().collect();
            Ok(json!({ "content": tail.join("\n"), "path": path_str }))
        }
        Err(_) => Ok(json!({ "content": "", "path": path_str })),
    }
}

#[command]
pub async fn get_toolsets(state: State<'_, AppState>, app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    // Try gateway first — same path as Electron (tools.list → tools.configure)
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        if gw.is_running().await {
            if let Ok(res) = gw.call("tools.list", json!({})).await {
                let mut toolsets = Vec::new();
                // Gateway may return toolsets as a top-level array or nested under "toolsets"
                let items = if let Some(arr) = res.as_array() {
                    arr.clone()
                } else if let Some(arr) = res.get("toolsets").and_then(|v| v.as_array()) {
                    arr.clone()
                } else {
                    vec![]
                };
                for item in &items {
                    let key = item.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let label = item.get("label").and_then(|v| v.as_str()).unwrap_or(key);
                    let description = item.get("description").and_then(|v| v.as_str()).unwrap_or("");
                    let enabled = item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                    let source = item.get("source").and_then(|v| v.as_str()).unwrap_or("built-in");
                    toolsets.push(json!({ "key": key, "label": label, "description": description, "enabled": enabled, "source": source }));
                }
                if !toolsets.is_empty() { return Ok(json!(toolsets)); }
            }
        }
    }
    drop(gateway);

    // Fallback: run CLI `hermes tools list` and parse output
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let hermes_home = python::get_hermes_home_with_profile(Some(&app), profile);
    eprintln!("[tools] CLI fallback: python={:?}, repo={:?}, home={:?}", python_path, repo_path, hermes_home);
    if !python_path.exists() {
        eprintln!("[tools] Python not found");
        return Ok(json!([]));
    }

    let mut cmd = std::process::Command::new(&python_path);
    cmd.args(["-m", "hermes_cli.main", "tools", "list"])
        .current_dir(repo_path)
        .env("HERMES_HOME", &hermes_home)
        .env("COLUMNS", "300");

    let output = cmd.output();

    match output {
        Ok(out) => {
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                eprintln!("[tools] CLI error: {}", stderr);
                return Ok(json!([]));
            }
            let text = String::from_utf8_lossy(&out.stdout);
            let re = regex::Regex::new(r"\x1b\[[0-9;]*[mK]").unwrap();
            let clean = re.replace_all(&text, "");
            eprintln!("[tools] CLI output lines: {}", clean.lines().count());
            let mut toolsets = Vec::new();
            let mut source = "built-in".to_string();

            for line in clean.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() { continue; }
                // Section headers end with ':'
                if trimmed.ends_with(':') && !trimmed.contains("enabled") && !trimmed.contains("disabled") {
                    let lower = trimmed.to_lowercase();
                    if lower.contains("plugin") { source = "plugin".to_string(); }
                    else if lower.contains("user") { source = "user".to_string(); }
                    else if lower.contains("mcp") { source = "mcp".to_string(); }
                    else if lower.contains("built-in") { source = "built-in".to_string(); }
                    continue;
                }

                // MCP lines: "byterover  all tools enabled"
                if source == "mcp" {
                    if let Some(space_pos) = trimmed.find(' ') {
                        let key = &trimmed[..space_pos];
                        let status = trimmed[space_pos..].trim();
                        if !key.is_empty() {
                            toolsets.push(json!({ "key": key, "label": key, "description": status, "enabled": status.contains("enabled"), "source": "mcp" }));
                        }
                    }
                    continue;
                }

                // Match lines like: "✓ enabled  web  🌐 Web search..."
                let pat = regex::Regex::new(r"^[✓✗✔✘]\s+(enabled|disabled)\s+(\S+)\s+(.*)").unwrap();
                if let Some(caps) = pat.captures(trimmed) {
                    let enabled = caps.get(1).map(|m| m.as_str() == "enabled").unwrap_or(false);
                    let key = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
                    let desc = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
                    toolsets.push(json!({ "key": key, "label": key, "description": desc, "enabled": enabled, "source": source }));
                }
            }
            eprintln!("[tools] Parsed {} toolsets", toolsets.len());
            Ok(json!(toolsets))
        }
        Err(e) => {
            eprintln!("[tools] Failed to run CLI: {}", e);
            Ok(json!([]))
        }
    }
}

#[command]
pub async fn set_toolset_enabled(state: State<'_, AppState>, app: AppHandle, key: String, enabled: bool, profile: Option<String>) -> Result<Value, String> {
    // Use gateway RPC — same path as Electron (tuiGateway.toolConfigure)
    {
        let gateway = state.gateway.lock().await;
        if let Some(gw) = gateway.as_ref() {
            if gw.is_running().await {
                let result = gw.call("tools.configure", json!({ "action": if enabled { "enable" } else { "disable" }, "names": [key] })).await;
                match result {
                    Ok(_) => return Ok(json!({ "success": true })),
                    Err(e) => eprintln!("[tools] gateway configure failed: {}, falling back to config.yaml", e),
                }
            }
        }
    }

    // Fallback: direct config.yaml write (offline / pre-gateway)
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

    if let Some(new_content) = config_utils::set_toolsets_enabled(&content, &key, enabled) {
        fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false }))
    }
}

#[command]
pub async fn get_plugins(app: AppHandle, _profile: Option<String>) -> Result<Value, String> {
    let output = run_hermes_cli(&app, &["plugins", "list"])?;
    Ok(json!(parse_plugins_table(&output)))
}

fn parse_plugins_table(output: &str) -> Vec<Value> {
    let mut plugins = Vec::new();
    let lines: Vec<&str> = output.lines().collect();
    let mut i = 0;

    // Find data rows (lines starting with │)
    while i < lines.len() {
        let line = lines[i];
        if !line.trim_start().starts_with('│') { i += 1; continue; }
        // Skip header row (contains ┃)
        if line.contains('┃') || line.contains('┏') || line.contains('┡') { i += 1; continue; }
        // Skip separator lines
        if line.contains('┼') || line.contains('├') || line.contains('└') { i += 1; continue; }

        // Parse a data row: │ Name │ Status │ Version │ Description │ Source │
        let cells: Vec<&str> = line.split('│').collect();
        if cells.len() < 6 { i += 1; continue; }
        let name = cells[1].trim().to_string();
        let status = cells[2].trim().to_string();
        let version = cells[3].trim().to_string();
        let description = cells[4].trim().to_string();
        let source = cells[5].trim().to_string();

        // Skip continuation rows (empty name)
        if name.is_empty() { i += 1; continue; }

        let mut full_desc = description;
        // Collect continuation lines for description
        i += 1;
        while i < lines.len() {
            let cont = lines[i];
            if !cont.trim_start().starts_with('│') { break; }
            if cont.contains('┃') || cont.contains('┼') || cont.contains('└') { break; }
            let cont_cells: Vec<&str> = cont.split('│').collect();
            if cont_cells.len() >= 5 {
                let cont_name = cont_cells[1].trim();
                if !cont_name.is_empty() { break; }
                let cont_desc = cont_cells[4].trim();
                if !cont_desc.is_empty() {
                    if !full_desc.is_empty() { full_desc.push(' '); }
                    full_desc.push_str(cont_desc);
                }
            }
            i += 1;
        }

        plugins.push(json!({
            "name": name,
            "enabled": status == "enabled",
            "version": version,
            "description": full_desc,
            "source": source,
        }));
    }
    plugins
}

#[command]
pub async fn set_plugin_enabled(app: AppHandle, name: String, enabled: bool, _profile: Option<String>) -> Result<Value, String> {
    let action = if enabled { "enable" } else { "disable" };
    run_hermes_cli(&app, &["plugins", action, &name])?;
    Ok(json!({ "success": true }))
}

#[command]
pub async fn list_bundled_skills(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::skill_utils::list_bundled_skills(Some(&app), profile)
}

#[command]
pub async fn list_installed_skills(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::skill_utils::list_installed_skills(Some(&app), profile)
}

#[command]
pub async fn install_skill(app: AppHandle, identifier: String, _profile: Option<String>) -> Result<Value, String> {
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let hermes_home = python::get_hermes_home(Some(&app));
    let output = std::process::Command::new(python_path)
        .args(["-m", "hermes_cli.main", "skills", "install", &identifier])
        .current_dir(repo_path)
        .env("HERMES_HOME", hermes_home)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": String::from_utf8_lossy(&output.stderr).to_string() }))
    }
}

#[command]
pub async fn uninstall_skill(app: AppHandle, name: String, _profile: Option<String>) -> Result<Value, String> {
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let hermes_home = python::get_hermes_home(Some(&app));
    let output = std::process::Command::new(python_path)
        .args(["-m", "hermes_cli.main", "skills", "uninstall", &name])
        .current_dir(repo_path)
        .env("HERMES_HOME", hermes_home)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": String::from_utf8_lossy(&output.stderr).to_string() }))
    }
}

#[command]
pub async fn get_skill_content(path: String) -> Result<Value, String> {
    let skill_file = std::path::Path::new(&path).join("SKILL.md");
    if !skill_file.exists() { return Ok(json!("")); }
    match fs::read_to_string(skill_file) {
        Ok(content) => Ok(json!(content)),
        Err(_) => Ok(json!("")),
    }
}
