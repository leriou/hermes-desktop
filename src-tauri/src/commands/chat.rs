use serde_json::{json, Value};
use tauri::{command, State, AppHandle};
use crate::AppState;
use std::fs;
use crate::python;
#[command]
pub async fn send_message(
    state: State<'_, AppState>,
    message: String,
    _profile: Option<String>,
    resume_session_id: Option<String>,
    _history: Option<Value>,
    _attachments: Option<Value>,
    _context_folder: Option<String>
) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    
    let session_id = if let Some(sid) = resume_session_id {
        sid
    } else {
        let res = gw.call("session.create", json!({})).await.map_err(|e| e.to_string())?;
        res.get("session_id").and_then(|v| v.as_str()).ok_or("Failed to create session")?.to_string()
    };

    gw.call("prompt.submit", json!({ "session_id": session_id, "text": message })).await.map_err(|e| e.to_string())?;
    
    Ok(json!({ "response": "streaming", "sessionId": session_id }))
}

#[command]
pub async fn abort_chat(state: State<'_, AppState>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Gateway not running")?;
    if let Ok(recent) = gw.call("session.most_recent", json!({})).await {
        if let Some(sid) = recent.get("session_id").and_then(|v| v.as_str()) {
            let _ = gw.call("session.interrupt", json!({ "session_id": sid })).await;
        }
    }
    Ok(Value::Null)
}

#[command]
pub async fn copy_to_clipboard(app: AppHandle, text: String) -> Result<Value, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[command]
pub async fn stage_attachment(app: AppHandle, session_id: String, filename: String, base64_bytes: String) -> Result<Value, String> {
    let home = python::get_hermes_home(Some(&app));
    let attach_dir = home.join("desktop").join("attachments").join(&session_id);
    fs::create_dir_all(&attach_dir).map_err(|e| e.to_string())?;
    let data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &base64_bytes)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    let file_path = attach_dir.join(&filename);
    fs::write(&file_path, data).map_err(|e| e.to_string())?;
    Ok(json!(file_path.to_string_lossy()))
}

#[command]
pub async fn clear_staged_attachments(app: AppHandle, session_id: String) -> Result<Value, String> {
    let home = python::get_hermes_home(Some(&app));
    let attach_dir = home.join("desktop").join("attachments").join(&session_id);
    if attach_dir.exists() {
        fs::remove_dir_all(&attach_dir).map_err(|e| e.to_string())?;
    }
    Ok(Value::Null)
}

#[command]
pub async fn discover_provider_models(state: State<'_, AppState>, provider: String, base_url: Option<String>, api_key: Option<String>, _profile: Option<String>) -> Result<Value, String> {
    let gateway = state.gateway.lock().await;
    if let Some(gw) = gateway.as_ref() {
        if let Ok(val) = gw.call("model.discover", json!({ "provider": provider, "base_url": base_url, "api_key": api_key })).await {
            // Gateway may return { models: [...] } or a bare array — normalize
            let models = if let Some(arr) = val.get("models").and_then(|v| v.as_array()) {
                arr.iter().filter_map(|m| m.as_str().map(|s| s.to_string())).collect::<Vec<_>>()
            } else if let Some(arr) = val.as_array() {
                arr.iter().filter_map(|m| m.as_str().map(|s| s.to_string())).collect::<Vec<_>>()
            } else {
                vec![]
            };
            return Ok(json!({ "models": models, "status": "ok", "cached": false }));
        }
    }
    Ok(json!({ "models": [], "status": "ok", "cached": false }))
}
