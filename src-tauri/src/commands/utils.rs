use serde_json::{json, Value};
use tauri::AppHandle;
use crate::python;

/// Run a hermes CLI subcommand and return stdout as String.
pub fn run_hermes_cli(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let python_path = python::get_python_path(Some(app));
    let repo_path = python::get_hermes_repo(Some(app));
    let hermes_home = python::get_hermes_home(Some(app));
    if !python_path.exists() {
        return Err("Python environment not found. Please install Hermes first.".to_string());
    }
    let output = std::process::Command::new(&python_path)
        .args([&["-m", "hermes_cli.main"], args].concat())
        .current_dir(repo_path)
        .env("HERMES_HOME", &hermes_home)
        .env("COLUMNS", "300")
        .output()
        .map_err(|e| format!("Failed to run hermes CLI: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() { stdout.clone() } else { stderr })
    }
}

/// Run a hermes kanban subcommand. If parse_json is true, parse stdout as JSON.
pub fn run_kanban_cli(app: &AppHandle, args: &[&str], profile: Option<&str>, parse_json: bool) -> Result<Value, String> {
    let mut full_args: Vec<String> = vec!["kanban".to_string()];
    full_args.extend(args.iter().map(|s| s.to_string()));
    if let Some(p) = profile {
        if p != "default" {
            full_args.push("-p".to_string());
            full_args.push(p.to_string());
        }
    }
    let python_path = python::get_python_path(Some(app));
    let repo_path = python::get_hermes_repo(Some(app));
    let hermes_home = python::get_hermes_home(Some(app));
    if !python_path.exists() {
        return Ok(json!({ "success": false, "error": "Python environment not found" }));
    }
    let output = std::process::Command::new(&python_path)
        .args([&["-m", "hermes_cli.main"], full_args.iter().map(|s| s.as_str()).collect::<Vec<_>>().as_slice()].concat())
        .current_dir(repo_path)
        .env("HERMES_HOME", &hermes_home)
        .env("COLUMNS", "300")
        .output()
        .map_err(|e| format!("Failed to run kanban: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(json!({ "success": false, "error": if stderr.is_empty() { stdout.clone() } else { stderr } }));
    }
    if parse_json {
        match serde_json::from_str::<Value>(stdout.trim()) {
            Ok(data) => Ok(json!({ "success": true, "data": data })),
            Err(e) => Ok(json!({ "success": false, "error": format!("JSON parse error: {}", e) })),
        }
    } else {
        Ok(json!({ "success": true }))
    }
}

pub fn snake_to_camel_sessions(val: Value) -> Vec<Value> {
    // Gateway returns { "sessions": [...] } — extract the inner array
    let arr = if let Some(sessions) = val.get("sessions").and_then(|v| v.as_array()) {
        sessions.clone()
    } else {
        val.as_array().cloned().unwrap_or_default()
    };
    arr.into_iter().map(|s| {
        let obj = s.as_object().cloned().unwrap_or_default();
        let id = obj.get("id").cloned().unwrap_or(json!(""));
        let title = obj.get("title").cloned().unwrap_or(json!(""));
        let started_at = obj.get("started_at").or_else(|| obj.get("startedAt")).cloned().unwrap_or(json!(0));
        let source = obj.get("source").cloned().unwrap_or(json!("cli"));
        let message_count = obj.get("message_count").or_else(|| obj.get("messageCount")).cloned().unwrap_or(json!(0));
        let model = obj.get("model").cloned().unwrap_or(json!(""));
        let preview = obj.get("preview").or_else(|| obj.get("last_message")).cloned().unwrap_or(json!(""));
        json!({
            "id": id,
            "title": title,
            "startedAt": started_at,
            "source": source,
            "messageCount": message_count,
            "model": model,
            "preview": preview,
        })
    }).collect()
}
