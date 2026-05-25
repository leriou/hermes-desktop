#[cfg(feature = "napi")]
use napi_derive::napi;
use serde_json::{json, Value};
use std::path::Path;

pub mod config;

#[cfg_attr(feature = "napi", napi)]
pub fn get_session_messages_json(
    db_path: String,
    desktop_dir: String,
    sessions_dir: String,
    session_id: String,
) -> String {
    let items = get_session_messages_impl(&db_path, &desktop_dir, &sessions_dir, &session_id)
        .unwrap_or_else(|_| Vec::new());
    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn persist_message_json(
    desktop_dir: String,
    sid: String,
    role: String,
    content: String,
    tool_call_id: Option<String>,
    tool_name: Option<String>,
) {
    persist_message_impl(&desktop_dir, &sid, &role, &content, tool_call_id.as_deref(), tool_name.as_deref());
}

// --------------------------------------------------------------------------
// Core Logic (can be called directly by Tauri via RLib)
// --------------------------------------------------------------------------

pub fn persist_message_impl(
    desktop_dir: &str,
    sid: &str,
    role: &str,
    content: &str,
    tool_call_id: Option<&str>,
    tool_name: Option<&str>,
) {
    let dir_path = Path::new(desktop_dir);
    let _ = std::fs::create_dir_all(dir_path);
    let file_path = dir_path.join(format!("{}.json", sid));

    let mut msgs: Vec<Value> = if file_path.exists() {
        match std::fs::read_to_string(&file_path) {
            Ok(c) => serde_json::from_str(&c).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    msgs.push(json!({
        "role": role,
        "content": content,
        "tool_call_id": tool_call_id,
        "tool_name": tool_name,
        "ts": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
    }));

    if let Ok(new_content) = serde_json::to_string(&msgs) {
        let _ = std::fs::write(&file_path, new_content);
    }
}

pub fn get_session_messages_impl(
    db_path: &str,
    desktop_dir: &str,
    sessions_dir: &str,
    session_id: &str,
) -> Result<Vec<Value>, String> {
    // 1. Try state.db first (authoritative: has reasoning, tool_calls, proper ordering)
    let db_p = Path::new(db_path);
    if db_p.exists() {
        if let Ok(items) = read_messages_from_db(db_p, session_id) {
            if !items.is_empty() {
                return Ok(items);
            }
        }
    }

    // 2. Fallback: desktop persisted messages
    if let Ok(items) = load_persisted_messages(desktop_dir, session_id) {
        if !items.is_empty() {
            return Ok(items);
        }
    }

    // 3. Fallback: try session JSON log file
    session_json_log_fallback(sessions_dir, session_id)
}

fn load_persisted_messages(desktop_dir: &str, session_id: &str) -> Result<Vec<Value>, String> {
    let file_path = Path::new(desktop_dir).join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Ok(Vec::new());
    }

    let raw = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let parsed: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();

    let mut items = Vec::new();
    let mut idx = 0u64;
    for m in parsed {
        idx += 1;
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("");
        let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let timestamp = m.get("ts").and_then(|v| v.as_f64()).unwrap_or(0.0) / 1000.0;

        match role {
            "user" => {
                if content.is_empty() { continue; }
                items.push(json!({ "kind": "user", "id": idx, "content": content, "timestamp": timestamp }));
            }
            "assistant" => {
                if !content.is_empty() {
                    items.push(json!({ "kind": "assistant", "id": idx, "content": content, "timestamp": timestamp }));
                }
            }
            "tool" => {
                let name = m.get("tool_name").and_then(|v| v.as_str()).unwrap_or("tool").to_string();
                let call_id = m.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                items.push(json!({ "kind": "tool_result", "id": idx, "callId": call_id, "name": name, "content": content, "timestamp": timestamp }));
            }
            "tool_call" => {
                let name = m.get("tool_name").and_then(|v| v.as_str()).unwrap_or("tool").to_string();
                let call_id = m.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                items.push(json!({ "kind": "tool_call", "id": idx, "callId": call_id, "name": name, "args": content, "timestamp": timestamp }));
            }
            _ => {}
        }
    }
    Ok(items)
}

struct DecodedContent {
    text: String,
    attachments: Vec<Value>,
}

fn decode_content_full(raw: &str, message_id: i64) -> DecodedContent {
    if raw.is_empty() {
        return DecodedContent { text: String::new(), attachments: Vec::new() };
    }
    if raw.starts_with('\0') && raw.len() > 6 && &raw[1..6] == "json:" {
        match serde_json::from_str::<Value>(&raw[6..]) {
            Ok(Value::Array(parts)) => {
                let mut texts = Vec::new();
                let mut attachments = Vec::new();
                let mut img_idx = 0u64;
                for p in &parts {
                    if let Some(s) = p.as_str() {
                        if !s.is_empty() { texts.push(s.to_string()); }
                        continue;
                    }
                    let obj = match p.as_object() {
                        Some(o) => o,
                        None => continue,
                    };
                    let typ = obj.get("type").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
                    match typ.as_str() {
                        "text" | "input_text" | "output_text" => {
                            if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                                if !t.is_empty() { texts.push(t.to_string()); }
                            }
                        }
                        "image_url" | "input_image" => {
                            let url = if let Some(ref_val) = obj.get("image_url") {
                                if let Some(u) = ref_val.as_str() {
                                    Some(u.to_string())
                                } else if let Some(u) = ref_val.get("url").and_then(|v| v.as_str()) {
                                    Some(u.to_string())
                                } else { None }
                            } else { None };
                            if let Some(url) = url {
                                if url.starts_with("data:image/") {
                                    let mime = url["data:".len()..url.find(';').unwrap_or(url.len())].to_string();
                                    let ext = match mime.as_str() {
                                        "image/png" => "png",
                                        "image/jpeg" => "jpg",
                                        "image/gif" => "gif",
                                        "image/webp" => "webp",
                                        _ => "bin",
                                    };
                                    attachments.push(json!({
                                        "id": format!("db-{}-{}", message_id, img_idx),
                                        "kind": "image",
                                        "name": format!("image.{}", ext),
                                        "mime": mime,
                                        "size": 0,
                                        "dataUrl": url,
                                    }));
                                    img_idx += 1;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                return DecodedContent { text: texts.join("\n\n"), attachments };
            }
            Ok(Value::String(s)) => {
                return DecodedContent { text: s, attachments: Vec::new() };
            }
            _ => {}
        }
    }
    DecodedContent { text: raw.to_string(), attachments: Vec::new() }
}

fn pick_reasoning(reasoning: Option<&str>, reasoning_content: Option<&str>, reasoning_details: Option<&str>) -> String {
    if let Some(r) = reasoning {
        let t = r.trim();
        if !t.is_empty() { return t.to_string(); }
    }
    if let Some(r) = reasoning_content {
        let t = r.trim();
        if !t.is_empty() { return t.to_string(); }
    }
    if let Some(r) = reasoning_details {
        let t = r.trim();
        if !t.is_empty() {
            // Try to parse as JSON array of {text, thinking} objects
            if let Ok(Value::Array(entries)) = serde_json::from_str::<Value>(t) {
                let texts: Vec<String> = entries.iter().filter_map(|e| {
                    let obj = e.as_object()?;
                    if let Some(s) = obj.get("text").and_then(|v| v.as_str()) {
                        if !s.is_empty() { return Some(s.to_string()); }
                    }
                    if let Some(s) = obj.get("thinking").and_then(|v| v.as_str()) {
                        if !s.is_empty() { return Some(s.to_string()); }
                    }
                    None
                }).collect();
                if !texts.is_empty() { return texts.join("\n\n"); }
            }
            if let Ok(Value::String(s)) = serde_json::from_str::<Value>(t) {
                return s;
            }
            return t.to_string();
        }
    }
    String::new()
}

fn parse_tool_calls(raw: Option<&str>) -> Vec<(String, String, String)> {
    let raw = match raw {
        Some(r) if !r.trim().is_empty() => r,
        _ => return Vec::new(),
    };
    let parsed: Vec<Value> = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for entry in &parsed {
        let obj = match entry.as_object() {
            Some(o) => o,
            None => continue,
        };
        let fn_obj = obj.get("function").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let name = fn_obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name.is_empty() { continue; }
        let call_id = obj.get("call_id").and_then(|v| v.as_str())
            .or_else(|| obj.get("id").and_then(|v| v.as_str()))
            .unwrap_or("").to_string();
        let raw_args = fn_obj.get("arguments").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let args = serde_json::from_str::<Value>(&raw_args)
            .map(|v| serde_json::to_string_pretty(&v).unwrap_or(raw_args.clone()))
            .unwrap_or(raw_args);
        out.push((call_id, name, args));
    }
    out
}

fn read_messages_from_db(db_path: &Path, session_id: &str) -> Result<Vec<Value>, String> {
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, timestamp, \
                    tool_call_id, tool_calls, tool_name, \
                    reasoning, reasoning_content, reasoning_details \
             FROM messages \
             WHERE session_id = ? AND role IN ('user', 'assistant', 'tool') \
             ORDER BY timestamp, id"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![session_id], |row| {
        let id: i64 = row.get(0)?;
        let role: String = row.get(1)?;
        let content: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
        let timestamp: f64 = row.get(3)?;
        let tool_call_id: Option<String> = row.get(4)?;
        let tool_calls: Option<String> = row.get(5)?;
        let tool_name: Option<String> = row.get(6)?;
        let reasoning: Option<String> = row.get(7)?;
        let reasoning_content: Option<String> = row.get(8)?;
        let reasoning_details: Option<String> = row.get(9)?;
        Ok((id, role, content, timestamp, tool_call_id, tool_calls, tool_name, reasoning, reasoning_content, reasoning_details))
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row_result in rows {
        let (id, role, content, timestamp, tool_call_id, tool_calls, tool_name, reasoning, reasoning_content, reasoning_details) =
            row_result.map_err(|e: rusqlite::Error| e.to_string())?;

        let decoded = decode_content_full(&content, id);
        let has_attachments = !decoded.attachments.is_empty();

        match role.as_str() {
            "user" => {
                if decoded.text.is_empty() && !has_attachments { continue; }
                let mut msg = json!({
                    "kind": "user",
                    "id": id,
                    "content": decoded.text,
                    "timestamp": timestamp,
                });
                if has_attachments {
                    msg.as_object_mut().unwrap().insert("attachments".into(), json!(decoded.attachments));
                }
                items.push(msg);
            }
            "assistant" => {
                let reasoning_text = pick_reasoning(reasoning.as_deref(), reasoning_content.as_deref(), reasoning_details.as_deref());
                if !reasoning_text.is_empty() {
                    items.push(json!({
                        "kind": "reasoning",
                        "id": id,
                        "assistantId": id,
                        "text": reasoning_text,
                        "timestamp": timestamp,
                    }));
                }
                if !decoded.text.is_empty() || has_attachments {
                    let mut msg = json!({
                        "kind": "assistant",
                        "id": id,
                        "content": decoded.text,
                        "timestamp": timestamp,
                    });
                    if has_attachments {
                        msg.as_object_mut().unwrap().insert("attachments".into(), json!(decoded.attachments));
                    }
                    items.push(msg);
                }
                for tc in parse_tool_calls(tool_calls.as_deref()) {
                    items.push(json!({
                        "kind": "tool_call",
                        "id": id,
                        "assistantId": id,
                        "callId": tc.0,
                        "name": tc.1,
                        "args": tc.2,
                        "timestamp": timestamp,
                    }));
                }
            }
            "tool" => {
                let mut msg = json!({
                    "kind": "tool_result",
                    "id": id,
                    "callId": tool_call_id.unwrap_or_default(),
                    "name": tool_name.unwrap_or_else(|| "tool".into()),
                    "content": decoded.text,
                    "timestamp": timestamp,
                });
                if has_attachments {
                    msg.as_object_mut().unwrap().insert("attachments".into(), json!(decoded.attachments));
                }
                items.push(msg);
            }
            _ => {}
        }
    }
    Ok(items)
}

// ── N-API YAML round-trip ───────────────────────────────

#[cfg_attr(feature = "napi", napi)]
pub fn yaml_to_json(yaml_content: String) -> Option<String> {
    let value: Value = match serde_yaml::from_str(&yaml_content) {
        Ok(v) => v,
        Err(_) => return None,
    };
    Some(serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string()))
}

#[cfg_attr(feature = "napi", napi)]
pub fn json_to_yaml(json_content: String) -> Option<String> {
    let value: Value = match serde_json::from_str(&json_content) {
        Ok(v) => v,
        Err(_) => return None,
    };
    serde_yaml::to_string(&value).ok()
}

// ── N-API config wrappers ───────────────────────────────

#[cfg_attr(feature = "napi", napi)]
pub fn read_env_file(env_path: String) -> String {
    let path = Path::new(&env_path);
    let map = config::read_env(path);
    serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn set_env_value_file(env_path: String, key: String, value: String) -> bool {
    let path = Path::new(&env_path);
    config::set_env_value(path, &key, &value).is_ok()
}

#[cfg_attr(feature = "napi", napi)]
pub fn get_yaml_config_value(content: String, dotted_key: String) -> Option<String> {
    config::get_yaml_path(&content, &dotted_key)
}

#[cfg_attr(feature = "napi", napi)]
pub fn set_yaml_config_value(content: String, key: String, value: String) -> String {
    config::set_yaml_value(&content, &key, &value)
}

#[cfg_attr(feature = "napi", napi)]
pub fn get_model_aliases_from_yaml(content: String) -> String {
    let aliases = config::get_model_aliases(&content);
    serde_json::to_string(&aliases).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn parse_toolsets_from_yaml(content: String) -> String {
    let set = config::parse_enabled_toolsets(&content);
    let mut vec: Vec<String> = set.into_iter().collect();
    vec.sort();
    serde_json::to_string(&vec).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn set_toolsets_in_yaml(content: String, key: String, enabled: bool) -> Option<String> {
    config::set_toolsets_enabled(&content, &key, enabled)
}

#[cfg_attr(feature = "napi", napi)]
pub fn list_mcp_servers_from_yaml(content: String) -> String {
    let servers = config::list_mcp_servers(&content);
    serde_json::to_string(&servers).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn list_plugins_from_yaml(content: String) -> String {
    let plugins = config::list_plugins(&content);
    serde_json::to_string(&plugins).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn set_plugin_in_yaml(content: String, name: String, enabled: bool) -> Option<String> {
    config::set_plugin_state(&content, &name, enabled)
}

// ── N-API session helpers ───────────────────────────────

#[cfg_attr(feature = "napi", napi)]
pub fn get_session_stats(db_path: String) -> String {
    let path = Path::new(&db_path);
    if !path.exists() {
        return json!({"totalSessions": 0, "totalMessages": 0}).to_string();
    }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return json!({"totalSessions": 0, "totalMessages": 0}).to_string(),
    };
    let sessions: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let messages: i64 = conn
        .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
        .unwrap_or(0);
    json!({"totalSessions": sessions, "totalMessages": messages}).to_string()
}

#[cfg_attr(feature = "napi", napi)]
pub fn list_sessions_from_db(db_path: String, limit: i64, offset: i64) -> String {
    let path = Path::new(&db_path);
    if !path.exists() { return "[]".to_string(); }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return "[]".to_string(),
    };
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.source, s.started_at, s.ended_at, s.message_count, s.model, s.title
         FROM sessions s ORDER BY s.started_at DESC LIMIT ? OFFSET ?"
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    let rows = match stmt.query_map(rusqlite::params![limit, offset], |row| {
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "source": row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            "started_at": row.get::<_, f64>(2)?,
            "ended_at": row.get::<_, Option<f64>>(3)?,
            "message_count": row.get::<_, i64>(4)?,
            "model": row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            "title": row.get::<_, Option<String>>(6)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return "[]".to_string(),
    };
    let items: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn search_sessions_fts(db_path: String, query: String, limit: i64) -> String {
    let path = Path::new(&db_path);
    if !path.exists() { return "[]".to_string(); }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return "[]".to_string(),
    };
    // Check FTS table exists
    let has_fts: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;
    if !has_fts { return "[]".to_string(); }

    // Sanitize: quote each word for FTS5 safety
    let sanitized: String = query
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");
    if sanitized.is_empty() { return "[]".to_string(); }

    let mut stmt = match conn.prepare(
        "SELECT DISTINCT m.session_id, s.title, s.started_at, s.source, s.message_count, s.model,
                snippet(messages_fts, 0, '<<', '>>', '...', 40) as snippet
         FROM messages_fts
         JOIN messages m ON m.id = messages_fts.rowid
         JOIN sessions s ON s.id = m.session_id
         WHERE messages_fts MATCH ?
         ORDER BY rank LIMIT ?"
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    let rows = match stmt.query_map(rusqlite::params![sanitized, limit], |row| {
        Ok(json!({
            "sessionId": row.get::<_, String>(0)?,
            "title": row.get::<_, Option<String>>(1)?,
            "startedAt": row.get::<_, f64>(2)?,
            "source": row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            "messageCount": row.get::<_, i64>(4)?,
            "model": row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            "snippet": row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        }))
    }) {
        Ok(r) => r,
        Err(_) => return "[]".to_string(),
    };
    let items: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn delete_session_from_db(db_path: String, session_id: String) -> bool {
    let path = Path::new(&db_path);
    if !path.exists() { return false; }
    let conn = match rusqlite::Connection::open(path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    match conn.execute_batch(&format!(
        "DELETE FROM messages WHERE session_id = '{}';
         DELETE FROM sessions WHERE id = '{}';",
        session_id.replace('\'', "''"),
        session_id.replace('\'', "''"),
    )) {
        Ok(_) => true,
        Err(_) => false,
    }
}

#[cfg_attr(feature = "napi", napi)]
pub fn sync_session_ids_from_db(db_path: String, since_ts: f64) -> String {
    let path = Path::new(&db_path);
    if !path.exists() { return "[]".to_string(); }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return "[]".to_string(),
    };
    let mut stmt = match conn.prepare(
        "SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
         FROM sessions s WHERE s.started_at > ? ORDER BY s.started_at DESC"
    ) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };
    let rows = match stmt.query_map(rusqlite::params![since_ts], |row| {
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "startedAt": row.get::<_, f64>(1)?,
            "source": row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            "messageCount": row.get::<_, i64>(3)?,
            "model": row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            "title": row.get::<_, Option<String>>(5)?,
        }))
    }) {
        Ok(r) => r,
        Err(_) => return "[]".to_string(),
    };
    let items: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}

#[cfg_attr(feature = "napi", napi)]
pub fn get_first_user_message(db_path: String, session_id: String) -> Option<String> {
    let path = Path::new(&db_path);
    if !path.exists() { return None; }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return None,
    };
    conn.query_row(
        "SELECT content FROM messages WHERE session_id = ? AND role = 'user' AND content IS NOT NULL ORDER BY timestamp, id LIMIT 1",
        rusqlite::params![session_id],
        |row| row.get::<_, String>(0),
    ).ok()
}

#[cfg_attr(feature = "napi", napi)]
pub fn refresh_message_counts(db_path: String, ids_json: String) -> String {
    let ids: Vec<String> = match serde_json::from_str(&ids_json) {
        Ok(v) => v,
        Err(_) => return "{}".to_string(),
    };
    if ids.is_empty() { return "{}".to_string(); }

    let path = Path::new(&db_path);
    if !path.exists() { return "{}".to_string(); }
    let conn = match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(c) => c,
        Err(_) => return "{}".to_string(),
    };

    let mut result = serde_json::Map::new();
    let chunk_size = 500;
    for chunk in ids.chunks(chunk_size) {
        let placeholders: Vec<&str> = chunk.iter().map(|_| "?").collect();
        let sql = format!(
            "SELECT id, message_count FROM sessions WHERE id IN ({})",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> = chunk.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let rows = match stmt.query_map(params.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for row in rows {
            if let Ok((id, count)) = row {
                result.insert(id, json!(count));
            }
        }
    }
    serde_json::to_string(&Value::Object(result)).unwrap_or_else(|_| "{}".to_string())
}

// ── Session helpers (existing, keep below) ──────────────

fn session_json_log_fallback(sessions_dir: &str, session_id: &str) -> Result<Vec<Value>, String> {
    let path = Path::new(sessions_dir).join(format!("session_{}.json", session_id));
    if !path.exists() { return Ok(Vec::new()); }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let msgs = match parsed.get("messages").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(Vec::new()),
    };
    let mut items = Vec::new();
    let mut idx = 0u64;
    for m in msgs {
        idx += 1;
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("");
        let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
        match role {
            "user" => {
                if content.is_empty() { continue; }
                items.push(json!({ "kind": "user", "id": idx, "content": content, "timestamp": 0 }));
            }
            "assistant" => {
                if !content.is_empty() {
                    items.push(json!({ "kind": "assistant", "id": idx, "content": content, "timestamp": 0 }));
                }
            }
            "tool" => {
                let name = m.get("tool_name").and_then(|v| v.as_str()).unwrap_or("tool").to_string();
                let call_id = m.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                items.push(json!({ "kind": "tool_result", "id": idx, "callId": call_id, "name": name, "content": content, "timestamp": 0 }));
            }
            _ => {}
        }
    }
    Ok(items)
}
