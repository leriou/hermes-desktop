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
pub async fn discover_provider_models(
    _state: State<'_, AppState>,
    provider: String,
    base_url: Option<String>,
    api_key: Option<String>,
    _profile: Option<String>,
) -> Result<Value, String> {
    let api_key = match api_key {
        Some(k) if !k.is_empty() => k,
        _ => return Ok(json!({ "models": [], "status": "no-key", "cached": false })),
    };

    let url = resolve_models_url(&provider, base_url.as_deref());

    let mut req = reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .header("Authorization", format!("Bearer {}", api_key));

    // Anthropic uses x-api-key header instead
    if provider == "anthropic" {
        req = req.header("x-api-key", &api_key)
                   .header("anthropic-version", "2023-06-01");
    }

    let resp = req.send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            format!("unknown-host")
        } else {
            format!("HTTP error: {}", e)
        }
    })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        if status == 401 || status == 403 {
            return Ok(json!({ "models": [], "status": "no-key", "cached": false }));
        }
        return Ok(json!({ "models": [], "status": "error", "cached": false }));
    }

    let body: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

    let models = extract_model_ids(&body);
    Ok(json!({ "models": models, "status": "ok", "cached": false }))
}

fn resolve_models_url(provider: &str, base_url: Option<&str>) -> String {
    if let Some(url) = base_url {
        let url = url.trim_end_matches('/');
        // User provided a full base URL — append /models
        return format!("{}/models", url);
    }
    match provider {
        "openai" | "openai-codex" => "https://api.openai.com/v1/models".into(),
        "anthropic" => "https://api.anthropic.com/v1/models".into(),
        "google" => "https://generativelanguage.googleapis.com/v1beta/models".into(),
        "xai" => "https://api.x.ai/v1/models".into(),
        "deepseek" => "https://api.deepseek.com/v1/models".into(),
        "groq" => "https://api.groq.com/openai/v1/models".into(),
        "mistral" => "https://api.mistral.ai/v1/models".into(),
        "together" => "https://api.together.xyz/v1/models".into(),
        "fireworks" => "https://api.fireworks.ai/inference/v1/models".into(),
        "openrouter" => "https://openrouter.ai/api/v1/models".into(),
        "cerebras" => "https://api.cerebras.ai/v1/models".into(),
        "perplexity" => "https://api.perplexity.ai/v1/models".into(),
        "huggingface" => "https://api-inference.huggingface.co/models".into(),
        "nvidia" => "https://integrate.api.nvidia.com/v1/models".into(),
        "zai" => "https://open.bigmodel.cn/api/paas/v4/models".into(),
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1/models".into(),
        "minimax" => "https://api.minimax.chat/v1/models".into(),
        "nous" => "https://api.nousresearch.com/v1/models".into(),
        _ => format!("https://api.{}.com/v1/models", provider),
    }
}

fn extract_model_ids(body: &Value) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    // OpenAI-compatible: { "data": [ { "id": "model-name" }, ... ] }
    if let Some(data) = body.get("data").and_then(|v| v.as_array()) {
        ids = data.iter().filter_map(|m| {
            m.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())
        }).collect();
    }
    // Google: { "models": [ { "name": "models/gemini-pro" }, ... ] }
    if ids.is_empty() {
        if let Some(models) = body.get("models").and_then(|v| v.as_array()) {
            ids = models.iter().filter_map(|m| {
                m.get("name").or(m.get("id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim_start_matches("models/").to_string())
            }).collect();
        }
    }
    // Sort: group by prefix (gpt-, claude-, glm-, gemini-), then version-descending
    ids.sort_by(|a, b| {
        let pa = model_sort_key(a);
        let pb = model_sort_key(b);
        pb.cmp(&pa)
    });
    ids
}

/// Produce a sort key that groups by model family prefix and orders
/// higher versions first: "gpt-5.5" > "gpt-5" > "gpt-4.1" > "claude-opus-4.7"
fn model_sort_key(id: &str) -> String {
    let lower = id.to_lowercase();
    // Extract prefix (letters+hyphens before the first digit)
    let prefix: String = lower.chars()
        .take_while(|c| !c.is_ascii_digit())
        .collect();
    // Rest is the version-like suffix
    let version = &lower[prefix.len()..];
    // Pad numeric segments to fixed width so "5.5" > "5" > "4.1" lexicographically
    let padded_version: String = version.split(|c: char| c == '.' || c == '-')
        .map(|seg| {
            if let Ok(n) = seg.parse::<u32>() {
                format!("{:06}", n)
            } else {
                seg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(".");
    format!("{}{}", prefix, padded_version)
}
