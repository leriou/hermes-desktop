use serde_json::{json, Value};
use tauri::{command, State, AppHandle};
use crate::AppState;
use crate::tui_gateway::TuiGateway;
use std::sync::Arc;
#[command]
pub async fn start_gateway(state: State<'_, AppState>, app: AppHandle, profile: Option<String>) -> Result<bool, String> {
    let mut gateway_guard = state.gateway.lock().await;
    if let Some(gw) = gateway_guard.as_ref() {
        if gw.is_running().await {
            return Ok(true);
        }
    }

    let gw = Arc::new(TuiGateway::new(app, profile));
    eprintln!("[start_gateway] calling gw.start()...");
    match gw.clone().start().await {
        Ok(_) => {
            eprintln!("[start_gateway] gateway started successfully");
            *gateway_guard = Some(gw);
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
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.interrupt", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command]
pub async fn tui_undo(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.undo", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_compress(state: State<'_, AppState>, session_id: String, focus_topic: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.compress", json!({ "session_id": session_id, "focus_topic": focus_topic })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_set_goal(state: State<'_, AppState>, session_id: String, goal: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("slash.exec", json!({ "session_id": session_id, "command": format!("/goal {}", goal) })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_set_model(state: State<'_, AppState>, session_id: String, model: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("slash.exec", json!({ "session_id": session_id, "command": format!("/model {}", model) })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_list(state: State<'_, AppState>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("tools.list", json!({})).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_show(state: State<'_, AppState>, name: Option<String>, session_id: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    let mut args = json!({});
    if let Some(n) = name { args["name"] = json!(n); }
    if let Some(s) = session_id { args["session_id"] = json!(s); }
    gw.call("tools.show", args).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_tools_configure(state: State<'_, AppState>, name: String, enabled: bool, session_id: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    let mut args = json!({ "name": name, "enabled": enabled });
    if let Some(s) = session_id { args["session_id"] = json!(s); }
    gw.call("tools.configure", args).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_status(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.status", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_usage(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.usage", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_branch(state: State<'_, AppState>, session_id: String, name: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.branch", json!({ "session_id": session_id, "name": name })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_slash_exec(state: State<'_, AppState>, session_id: String, command: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("slash.exec", json!({ "session_id": session_id, "command": command })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_complete_slash(state: State<'_, AppState>, session_id: String, text: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("complete.slash", json!({ "session_id": session_id, "text": text })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_commands_catalog(state: State<'_, AppState>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("commands.catalog", json!({})).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_approval_respond(state: State<'_, AppState>, session_id: String, response: String, all: Option<bool>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("approval.respond", json!({ "session_id": session_id, "choice": response, "all": all.unwrap_or(false) })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_clarify_respond(state: State<'_, AppState>, session_id: String, answer: String, request_id: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("clarify.respond", json!({ "session_id": session_id, "answer": answer, "request_id": request_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_steer(state: State<'_, AppState>, session_id: String, text: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.steer", json!({ "session_id": session_id, "text": text })).await.map_err(|e| e.to_string())
}

#[command] pub async fn tui_session_title(state: State<'_, AppState>, session_id: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("session.title", json!({ "session_id": session_id })).await.map_err(|e| e.to_string())
}

#[command] pub async fn voice_tts(state: State<'_, AppState>, text: String) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    gw.call("voice.tts", json!({ "text": text })).await.map_err(|e| e.to_string())
}
