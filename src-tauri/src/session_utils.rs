use serde_json::{json, Value};
use crate::python;
use tauri::AppHandle;

fn profile_home(app: Option<&AppHandle>, profile: Option<String>) -> std::path::PathBuf {
    python::get_hermes_home_with_profile(app, profile)
}

fn state_db_path(app: Option<&AppHandle>, profile: Option<String>) -> Option<std::path::PathBuf> {
    let db = profile_home(app, profile).join("state.db");
    if db.exists() { Some(db) } else { None }
}

pub fn list_sessions(app: Option<&AppHandle>, profile: Option<String>, limit: Option<u32>, offset: Option<u32>) -> Result<Value, String> {
    if let Some(db_path) = state_db_path(app, profile.clone()) {
        match read_sessions_from_db(&db_path, limit, offset) {
            Ok(sessions) => return Ok(json!(sessions)),
            Err(e) => eprintln!("[sessions] state.db read failed: {}, falling back to CLI", e),
        }
    }
    cli_list_sessions(app, profile, limit)
}

fn read_sessions_from_db(db_path: &std::path::Path, limit: Option<u32>, offset: Option<u32>) -> Result<Vec<Value>, String> {
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ).map_err(|e| e.to_string())?;

    let lim = limit.unwrap_or(2000);
    let off = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title, \
             (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role = 'user' \
              ORDER BY m.id DESC LIMIT 1) as preview \
             FROM sessions s \
             ORDER BY s.started_at DESC \
             LIMIT ?1 OFFSET ?2"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![lim, off], |row| {
        let id: String = row.get(0)?;
        let started_at: f64 = row.get(1)?;
        let source: String = row.get(2)?;
        let message_count: i64 = row.get(3)?;
        let model: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
        let title: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
        let preview: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
        Ok((id, started_at, source, message_count, model, title, preview))
    }).map_err(|e| e.to_string())?;

    let raw: Vec<(String, f64, String, i64, String, String, String)> = rows
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    // Batch-generate missing titles with a single query instead of N+1
    let empty_ids: Vec<&str> = raw.iter()
        .filter(|(_, _, _, _, _, t, _)| t.is_empty())
        .map(|(id, _, _, _, _, _, _)| id.as_str())
        .collect();
    let mut fallback_titles = std::collections::HashMap::new();
    if !empty_ids.is_empty() {
        let placeholders: Vec<String> = empty_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT m.session_id, m.content FROM messages m \
             INNER JOIN (SELECT session_id, MIN(id) as min_id FROM messages \
                         WHERE session_id IN ({}) AND role = 'user' AND content IS NOT NULL \
                         GROUP BY session_id) sub ON m.session_id = sub.session_id AND m.id = sub.min_id",
            placeholders.join(",")
        );
        if let Ok(mut ft_stmt) = conn.prepare(&sql) {
            let params: Vec<String> = empty_ids.iter().map(|s| s.to_string()).collect();
            let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
            if let Ok(ft_rows) = ft_stmt.query_map(param_refs.as_slice(), |row| {
                let sid: String = row.get(0)?;
                let content: String = row.get(1)?;
                Ok((sid, content))
            }) {
                for r in ft_rows.flatten() {
                    let (sid, content) = r;
                    let mut text = content.trim().to_string();
                    text = text.chars().take(80).collect();
                    if text.chars().count() > 50 {
                        let byte_limit = text.char_indices().nth(50).map_or(text.len(), |(i, _)| i);
                        if let Some(pos) = text[..byte_limit].rfind(' ') {
                            text.truncate(pos);
                        } else {
                            text.truncate(byte_limit);
                        }
                        text.push('…');
                    }
                    fallback_titles.insert(sid, text);
                }
            }
        }
    }

    let mut sessions = Vec::new();
    for (id, started_at, source, message_count, model, title, preview) in raw {
        let title = if title.is_empty() {
            fallback_titles.get(&id).cloned().unwrap_or_default()
        } else {
            title
        };
        let preview_text: String = preview.chars().take(80).collect();
        sessions.push(json!({
            "id": id,
            "title": title,
            "startedAt": started_at,
            "source": source,
            "messageCount": message_count,
            "model": model,
            "preview": preview_text,
        }));
    }
    Ok(sessions)
}

pub fn search_sessions(app: Option<&AppHandle>, query: &str, limit: Option<u32>, profile: Option<String>) -> Result<Value, String> {
    if let Some(db_path) = state_db_path(app, profile) {
        match search_sessions_from_db(&db_path, query, limit.unwrap_or(50)) {
            Ok(results) => return Ok(json!(results)),
            Err(e) => eprintln!("[sessions] search state.db failed: {}", e),
        }
    }
    Ok(json!([]))
}

fn search_sessions_from_db(db_path: &std::path::Path, query: &str, limit: u32) -> Result<Vec<Value>, String> {
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ).map_err(|e| e.to_string())?;

    // Try FTS5 first, fall back to LIKE
    let has_fts = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
        .map_err(|e| e.to_string())?
        .exists([])
        .unwrap_or(false);

    if has_fts {
        let sanitized: String = query
            .trim()
            .split_whitespace()
            .filter(|w| !w.is_empty())
            .map(|w| format!("\"{}\"*", w.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");
        if !sanitized.is_empty() {
            let sql = "SELECT DISTINCT m.session_id, s.title, s.started_at, s.source, s.message_count, s.model, \
                       snippet(messages_fts, 0, '<<', '>>', '...', 40) as snippet \
                       FROM messages_fts \
                       JOIN messages m ON m.id = messages_fts.rowid \
                       JOIN sessions s ON s.id = m.session_id \
                       WHERE messages_fts MATCH ? \
                       ORDER BY rank \
                       LIMIT ?";
            if let Ok(mut stmt) = conn.prepare(sql) {
                let rows = stmt.query_map(rusqlite::params![sanitized, limit], |row| {
                    let id: String = row.get(0)?;
                    let title: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
                    let started_at: f64 = row.get(2)?;
                    let source: String = row.get(3)?;
                    let message_count: i64 = row.get(4)?;
                    let model: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
                    let snippet: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
                    Ok(json!({
                        "sessionId": id,
                        "title": title,
                        "startedAt": started_at,
                        "source": source,
                        "messageCount": message_count,
                        "model": model,
                        "snippet": snippet,
                    }))
                });
                if let Ok(rows) = rows {
                    let results: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
        }
    }

    // LIKE fallback
    let pattern = format!("%{}%", query.replace('%', "\\%"));
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title \
             FROM sessions s \
             WHERE s.title LIKE ?1 COLLATE NOCASE \
             ORDER BY s.started_at DESC \
             LIMIT ?2"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![pattern, limit], |row| {
        let id: String = row.get(0)?;
        let started_at: f64 = row.get(1)?;
        let source: String = row.get(2)?;
        let message_count: i64 = row.get(3)?;
        let model: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
        let title: String = row.get::<_, Option<String>>(5)?.unwrap_or_default();
        Ok(json!({
            "sessionId": id,
            "title": title,
            "startedAt": started_at,
            "source": source,
            "messageCount": message_count,
            "model": model,
            "snippet": "",
        }))
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_session_messages(app: Option<&AppHandle>, session_id: &str, profile: Option<String>) -> Result<Value, String> {
    let home = profile_home(app, profile);

    let db_path = home.join("state.db").to_string_lossy().to_string();
    let desktop_dir = home.join("desktop").join("messages").to_string_lossy().to_string();
    let sessions_dir = home.join("sessions").to_string_lossy().to_string();

    let result = hermes_core::get_session_messages_impl(&db_path, &desktop_dir, &sessions_dir, session_id);
    match result {
        Ok(items) => {
            let max_msgs = 100;
            let max_tool_content = 8000;
            let items_val = json!(items);
            let mut arr = match items_val.as_array().cloned() {
                Some(a) => a,
                None => return Ok(json!([])),
            };
            if arr.len() > max_msgs {
                arr = arr.split_off(arr.len() - max_msgs);
            }
            for item in arr.iter_mut() {
                if item.get("kind").map(|v| v.as_str()) == Some(Some("tool_result")) {
                    if let Some(content) = item.get("content").and_then(|v| v.as_str()) {
                        if content.len() > max_tool_content {
                            item["content"] = json!(format!("{}\n\n... ({} chars total)",
                                &content[..content.char_indices().nth(max_tool_content).map_or(content.len(), |(i,_)| i)],
                                content.len()));
                        }
                    }
                }
            }
            Ok(Value::Array(arr))
        }
        Err(e) => Err(e),
    }
}

pub fn get_session_messages_before(app: Option<&AppHandle>, session_id: &str, before_timestamp: f64, limit: Option<u32>, profile: Option<String>) -> Result<Value, String> {
    let home = profile_home(app, profile);
    let db_path = home.join("state.db").to_string_lossy().to_string();
    let limit = limit.unwrap_or(50);
    let result = hermes_core::get_session_messages_before_impl(&db_path, session_id, before_timestamp, limit);
    match result {
        Ok(items) => {
            let max_tool_content = 8000;
            let items_val = json!(items);
            let mut arr = match items_val.as_array().cloned() {
                Some(a) => a,
                None => return Ok(json!([])),
            };
            for item in arr.iter_mut() {
                if item.get("kind").map(|v| v.as_str()) == Some(Some("tool_result")) {
                    if let Some(content) = item.get("content").and_then(|v| v.as_str()) {
                        if content.len() > max_tool_content {
                            item["content"] = json!(format!("{}\n\n... ({} chars total)",
                                &content[..content.char_indices().nth(max_tool_content).map_or(content.len(), |(i,_)| i)],
                                content.len()));
                        }
                    }
                }
            }
            Ok(Value::Array(arr))
        }
        Err(e) => Err(e),
    }
}

pub fn persist_message(app: Option<&AppHandle>, sid: &str, role: &str, content: &str, tool_call_id: Option<&str>, tool_name: Option<&str>, profile: Option<String>) {
    let home = profile_home(app, profile);
    let desktop_dir = home.join("desktop").join("messages").to_string_lossy().to_string();

    hermes_core::persist_message_impl(&desktop_dir, sid, role, content, tool_call_id, tool_name);
}

fn cli_list_sessions(app: Option<&AppHandle>, profile: Option<String>, limit: Option<u32>) -> Result<Value, String> {
    let python_path = python::get_python_path(app);
    let repo_path = python::get_hermes_repo(app);
    let hermes_home = python::get_hermes_home(app);

    if !python_path.exists() {
        return Ok(json!([]));
    }

    let mut cmd = std::process::Command::new(&python_path);
    cmd.args(["-m", "hermes_cli.main"]);
    
    if let Some(ref p) = profile {
        if p != "default" && !p.is_empty() {
            cmd.args(["-p", p]);
        }
    }
    
    let lim_str = limit.unwrap_or(2000).to_string();
    cmd.args(["sessions", "list", "--limit", &lim_str])
        .current_dir(&repo_path)
        .env("HERMES_HOME", &hermes_home)
        .env("COLUMNS", "300");

    match cmd.output() {
        Ok(out) => {
            if !out.status.success() {
                return Ok(json!([]));
            }
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            if text.contains("No sessions found") {
                return Ok(json!([]));
            }
            let re = regex::Regex::new(r"\x1b\[[0-9;]*[mK]").unwrap();
            let clean = re.replace_all(&text, "");
            let mut sessions = Vec::new();
            for line in clean.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with("Title") || trimmed.starts_with("─") || trimmed.starts_with("═") {
                    continue;
                }
                let parts: Vec<&str> = trimmed.split("  ").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                if parts.len() >= 2 {
                    let id = parts.last().unwrap().to_string();
                    let title = parts[0].to_string();
                    let time_str = if parts.len() >= 3 { parts[parts.len() - 2] } else { "" };
                    let started_at = parse_relative_time(time_str);
                    sessions.push(json!({
                        "id": id,
                        "title": title,
                        "startedAt": started_at,
                        "source": "local",
                        "messageCount": 0,
                        "model": "",
                    }));
                }
            }
            Ok(json!(sessions))
        }
        Err(_) => Ok(json!([])),
    }
}

fn parse_relative_time(s: &str) -> u64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = s.trim();
    if s.ends_with("h ago") {
        if let Ok(h) = s.replace("h ago", "").trim().parse::<u64>() {
            return now - h * 3600;
        }
    }
    if s.ends_with("m ago") {
        if let Ok(m) = s.replace("m ago", "").trim().parse::<u64>() {
            return now - m * 60;
        }
    }
    if s.ends_with("d ago") {
        if let Ok(d) = s.replace("d ago", "").trim().parse::<u64>() {
            return now - d * 86400;
        }
    }
    now
}
