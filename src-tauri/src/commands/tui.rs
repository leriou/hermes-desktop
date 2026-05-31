use serde_json::{json, Value};
use tauri::{command, State, AppHandle};
use crate::AppState;
use crate::tui_gateway::{TuiGateway, GatewayStatus};
use std::sync::Arc;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use crate::python;
use crate::config_utils;
use chrono::{DateTime, Utc, Duration};

#[command]
pub async fn home_health_summary(state: State<'_, AppState>, app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let gw = {
        let gateway_guard = state.gateway.lock().await;
        gateway_guard.as_ref().cloned()
    };

    let (status, running) = if let Some(ref gw) = gw {
        let health = gw.get_health().await;
        let status = health.get("status").and_then(|v| v.as_str()).unwrap_or("Stopped").to_string();
        let running = gw.is_running().await;
        (status, running)
    } else {
        ("Stopped".to_string(), false)
    };

    // MCP total from config
    let config_path = python::get_hermes_home_with_profile(Some(&app), profile.clone()).join("config.yaml");
    let mcp_total = if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            config_utils::list_mcp_servers(&content).len()
        } else {
            0
        }
    } else {
        0
    };

    // Scan logs
    let home = python::get_hermes_home(Some(&app));
    let logs_dir = home.join("logs");

    let mut errors_1h = 0;
    let mut errors_24h = 0;
    let mut latest_summary = None;
    let mut warning_servers = Vec::new();

    if logs_dir.exists() {
        let now = Utc::now();
        let hour_ago = now - Duration::hours(1);
        let day_ago = now - Duration::days(1);

        // Scan errors.log (bounded tail read: last 512KB)
        let err_log_path = logs_dir.join("errors.log");
        if let Ok(content) = read_last_bytes(&err_log_path, 512 * 1024) {
            for line in content.lines().rev().take(1000) {
                if line.contains("[ERROR]") || line.contains(" ERROR ") || line.contains("ERROR:") {
                    if let Some(ts) = parse_log_timestamp(line) {
                        if ts >= day_ago {
                            errors_24h += 1;
                            if ts >= hour_ago {
                                errors_1h += 1;
                            }
                            if latest_summary.is_none() {
                                latest_summary = Some(line.trim().to_string());
                            }
                        } else {
                            break; // assume chronological
                        }
                    }
                }
            }
        }

        // Scan mcp-stderr.log (bounded tail read: last 256KB)
        let mcp_log_path = logs_dir.join("mcp-stderr.log");
        if let Ok(content) = read_last_bytes(&mcp_log_path, 256 * 1024) {
            let mut current_server = None;
            for line in content.lines() {
                if line.contains("starting MCP server '") {
                    if let Some(pos) = line.find("MCP server '") {
                        let start = pos + "MCP server '".len();
                        if let Some(end) = line[start..].find('\'') {
                            current_server = Some(line[start..start+end].to_string());
                        }
                    }
                } else if line.contains("ERROR") || line.contains("Exception") || line.contains("Failed") {
                    if let Some(ref name) = current_server {
                        if !warning_servers.iter().any(|v: &Value| v["name"].as_str() == Some(name)) {
                            warning_servers.push(json!({
                                "name": name,
                                "summary": line.trim().chars().take(200).collect::<String>()
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "runtimeStatus": status,
        "gatewayRunning": running,
        "mcp": {
            "total": mcp_total,
            "warningServers": warning_servers,
        },
        "errors": {
            "lastHour": errors_1h,
            "lastDay": errors_24h,
            "latestSummary": latest_summary,
        }
    }))
}

fn read_last_bytes(path: &std::path::Path, limit: u64) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len();
    let to_read = size.min(limit);
    if to_read == 0 { return Ok(String::new()); }

    file.seek(SeekFrom::End(-(to_read as i64)))?;
    let mut buffer = Vec::with_capacity(to_read as usize);
    file.read_to_end(&mut buffer)?;

    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

fn parse_log_timestamp(line: &str) -> Option<DateTime<Utc>> {
    let bytes = line.as_bytes();
    if bytes.len() < 19 { return None; }

    for i in 0..=bytes.len() - 19 {
        if bytes[i+4] == b'-' && bytes[i+7] == b'-' &&
           bytes[i+10] == b' ' && bytes[i+13] == b':' && bytes[i+16] == b':' {
            if let Ok(sub) = std::str::from_utf8(&bytes[i..i+19]) {
                if let Ok(dt) = DateTime::parse_from_str(&(sub.to_string() + " +0000"), "%Y-%m-%d %H:%M:%S %z") {
                    return Some(dt.with_timezone(&Utc));
                }
            }
        }
    }
    None
}

#[command]
pub async fn copy_diagnostics(state: State<'_, AppState>, app: AppHandle) -> Result<String, String> {
    let gw = {
        let gateway_guard = state.gateway.lock().await;
        gateway_guard.as_ref().cloned()
    };

    let health = if let Some(gw) = gw {
        gw.get_health().await
    } else {
        json!({
            "status": "Stopped",
            "restartCount": 0,
            "maxRestarts": 5,
            "activeSessionId": null,
            "lastError": null,
            "lastReadyAt": null,
            "pendingRequests": 0,
        })
    };

    let version = app.package_info().version.to_string();
    let commit = env!("GIT_COMMIT").to_string();
    let build_ts = env!("BUILD_TIME").to_string();

    let mut report = String::new();
    report.push_str(&format!("Hermes Caduceus v{} (commit {})\n", version, commit));
    report.push_str(&format!("Build timestamp: {}\n", build_ts));
    report.push_str(&format!("Gateway status: {}\n", health.get("status").and_then(|v| v.as_str()).unwrap_or("unknown")));
    if let Some(err) = health.get("lastError").and_then(|v| v.as_str()) {
        report.push_str(&format!("Last error: {}\n", err));
    }
    report.push_str(&format!("Restarts: {}/{}\n",
        health.get("restartCount").and_then(|v| v.as_u64()).unwrap_or(0),
        health.get("maxRestarts").and_then(|v| v.as_u64()).unwrap_or(5),
    ));
    report.push_str(&format!("Pending RPC: {}\n",
        health.get("pendingRequests").and_then(|v| v.as_u64()).unwrap_or(0),
    ));
    if let Some(paths) = health.get("paths").and_then(|v| v.as_object()) {
        report.push_str("\nPaths:\n");
        for (key, val) in paths {
            report.push_str(&format!("  {}: {}\n", key, val));
        }
    }
    Ok(report)
}
#[command]
pub async fn start_gateway(state: State<'_, AppState>, app: AppHandle, profile: Option<String>) -> Result<bool, String> {
    let (gw, is_new) = {
        let mut gateway_guard = state.gateway.lock().await;
        if let Some(existing_gw) = gateway_guard.as_ref() {
            let status = {
                let inner = existing_gw.inner.lock().await;
                inner.status
            };
            if status == GatewayStatus::Ready || status == GatewayStatus::Starting || status == GatewayStatus::Reconnecting {
                return Ok(true);
            }
            if status == GatewayStatus::Failed {
                existing_gw.stop().await;
            }
        }
        let new_gw = Arc::new(TuiGateway::new(app, profile));
        *gateway_guard = Some(new_gw.clone());
        (new_gw, true)
    };

    if is_new {
        eprintln!("[start_gateway] starting new gateway instance...");
        match gw.start().await {
            Ok(_) => {
                eprintln!("[start_gateway] gateway started successfully");
                Ok(true)
            }
            Err(e) => {
                let err_msg = e.to_string();
                eprintln!("[start_gateway] FAILED: {}", err_msg);
                if err_msg.contains("Python") || err_msg.contains("venv") {
                    Err("Python environment not found. Please ensure Hermes is installed correctly.".to_string())
                } else {
                    Err(format!("Failed to start TUI Gateway: {}", err_msg))
                }
            }
        }
    } else {
        Ok(true)
    }
}

#[command]
pub async fn stop_gateway(state: State<'_, AppState>) -> Result<bool, String> {
    let mut gateway_guard = state.gateway.lock().await;
    if let Some(gw) = gateway_guard.take() {
        gw.stop().await;
    }
    Ok(true)
}

#[command]
pub async fn runtime_health(state: State<'_, AppState>) -> Result<Value, String> {
    let gw = {
        let gateway_guard = state.gateway.lock().await;
        gateway_guard.as_ref().cloned()
    };

    if let Some(gw) = gw {
        Ok(gw.get_health().await)
    } else {
        Ok(json!({
            "status": "Stopped",
            "restartCount": 0,
            "maxRestarts": 5,
            "activeSessionId": null,
            "lastError": null,
            "lastReadyAt": null,
            "pendingRequests": 0,
            "paths": null
        }))
    }
}

#[command]
pub async fn gateway_status(state: State<'_, AppState>) -> Result<bool, String> {
    let gateway_guard = state.gateway.lock().await;
    if let Some(gw) = gateway_guard.as_ref() {
        Ok(gw.is_running().await)
    } else {
        Ok(false)
    }
}

#[command]
pub async fn tui_create_session(state: State<'_, AppState>, model: Option<String>) -> Result<Value, String> {
    let gw = {
        let gateway = state.gateway.lock().await;
        gateway.as_ref().cloned().ok_or("Gateway not running")?
    };
    let res = gw.call("session.create", json!({ "model": model })).await.map_err(|e| e.to_string())?;
    if let Some(sid) = res.get("session_id").and_then(|v| v.as_str()) {
        gw.set_active_session(sid.to_string());
    }
    Ok(res)
}

#[command]
pub async fn tui_resume_session(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = {
        let gateway = state.gateway.lock().await;
        gateway.as_ref().cloned().ok_or("Gateway not running")?
    };
    let mut res = gw.call("session.resume", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())?;
    gw.set_active_session(session_id.clone());
    if let Some(runtime_sid) = res.get("session_id").and_then(|v| v.as_str()) {
        gw.bind_session_alias(runtime_sid, &session_id);
        if let Ok(status) = gw.call("session.status", json!({ "session_id": runtime_sid })).await {
            if let Some(obj) = res.as_object_mut() {
                obj.insert("status".to_string(), status);
            }
        }
    }
    Ok(res)
}

#[command]
pub async fn tui_session_history(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = {
        let gateway = state.gateway.lock().await;
        match gateway.as_ref() {
            Some(g) => g.clone(),
            None => return Ok(json!([])),
        }
    };
    match gw.call("session.history", json!({ "session_id": session_id })).await {
        Ok(val) => Ok(val),
        Err(_) => Ok(json!([])),
    }
}

#[command]
pub async fn tui_submit_prompt(state: State<'_, AppState>, _app: AppHandle, session_id: String, text: String, _profile: Option<String>) -> Result<Value, String> {
    let gw = {
        let gateway = state.gateway.lock().await;
        gateway.as_ref().cloned().ok_or("Gateway not running")?
    };
    gw.call("prompt.submit", json!({ "session_id": session_id, "text": text })).await.map_err(|e| e.to_string())
}

#[command]
pub async fn tui_interrupt(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.interrupt", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command]
pub async fn tui_undo(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.undo", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_compress(state: State<'_, AppState>, session_id: String, focus_topic: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.compress", json!({ "session_id": session_id, "focus_topic": focus_topic })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_set_goal(state: State<'_, AppState>, session_id: String, goal: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("slash.exec", json!({ "session_id": session_id, "command": format!("/goal {}", goal) })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_set_model(state: State<'_, AppState>, session_id: String, model: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("config.set", json!({ "session_id": session_id, "key": "model", "value": model })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_list(state: State<'_, AppState>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("tools.list", json!({})).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_show(state: State<'_, AppState>, name: Option<String>, session_id: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    let mut args = json!({});
    if let Some(n) = name { args["name"] = json!(n); }
    if let Some(s) = session_id { args["session_id"] = json!(s); }
    gw.call("tools.show", args).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_configure(state: State<'_, AppState>, name: String, enabled: bool, session_id: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    let mut args = json!({ "name": name, "enabled": enabled });
    if let Some(s) = session_id { args["session_id"] = json!(s); }
    gw.call("tools.configure", args).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_status(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.status", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_active_list(state: State<'_, AppState>, current_session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.active_list", json!({ "current_session_id": current_session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_usage(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.usage", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_branch(state: State<'_, AppState>, session_id: String, name: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.branch", json!({ "session_id": session_id, "name": name })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_slash_exec(state: State<'_, AppState>, session_id: String, command: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("slash.exec", json!({ "session_id": session_id, "command": command })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_complete_slash(state: State<'_, AppState>, session_id: String, text: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("complete.slash", json!({ "session_id": session_id, "text": text })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_commands_catalog(state: State<'_, AppState>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("commands.catalog", json!({})).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_approval_respond(state: State<'_, AppState>, session_id: String, response: String, all: Option<bool>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("approval.respond", json!({ "session_id": session_id, "choice": response, "all": all.unwrap_or(false) })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_clarify_respond(state: State<'_, AppState>, session_id: String, answer: String, request_id: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("clarify.respond", json!({ "session_id": session_id, "answer": answer, "request_id": request_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_sudo_respond(state: State<'_, AppState>, session_id: String, password: String, request_id: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("sudo.respond", json!({ "session_id": session_id, "password": password, "request_id": request_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_secret_respond(state: State<'_, AppState>, session_id: String, value: String, request_id: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("secret.respond", json!({ "session_id": session_id, "value": value, "request_id": request_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_steer(state: State<'_, AppState>, session_id: String, text: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.steer", json!({ "session_id": session_id, "text": text })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_title(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("session.title", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn voice_tts(state: State<'_, AppState>, text: String) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("voice.tts", json!({ "text": text })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_command_dispatch(state: State<'_, AppState>, session_id: String, name: String, arg: Option<String>) -> Result<Value, String> {
    let gw = { state.gateway.lock().await.as_ref().cloned().ok_or("Gateway not running")? };
    gw.call("command.dispatch", json!({ "session_id": session_id, "name": name, "arg": arg })).await.map_err(|e| e.to_string())
}

#[command]
pub async fn get_gateway_ws_port(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let gw = {
        let gateway_guard = state.gateway.lock().await;
        gateway_guard.as_ref().cloned()
    };

    match gw {
        Some(g) => Ok(g.get_ws_port().await),
        None => Ok(None),
    }
}
