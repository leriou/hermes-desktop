use serde_json::{json, Value};
use tauri::{command, AppHandle};
use crate::python;
use super::utils::*;

#[command]
pub async fn kanban_archive_task(app: AppHandle, task_id: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["archive", &task_id], profile.as_deref(), false).await
}

#[command]
pub async fn kanban_assign_task(app: AppHandle, task_id: String, assignee: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let assignee_val = assignee.as_deref().unwrap_or("none");
    run_kanban_cli(&app, &["assign", &task_id, assignee_val], profile.as_deref(), false).await
}

#[command]
pub async fn kanban_block_task(app: AppHandle, task_id: String, reason: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["block".to_string(), task_id.clone()];
    if let Some(r) = &reason { args.push(r.clone()); }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &arg_refs, profile.as_deref(), false).await
}

#[command]
pub async fn kanban_comment_task(app: AppHandle, task_id: String, body: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["comment", &task_id, &body], profile.as_deref(), false).await
}

#[command]
pub async fn kanban_complete_task(app: AppHandle, task_id: String, result: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let mut arg_refs = vec!["complete".to_string(), task_id.clone()];
    if let Some(r) = &result {
        arg_refs.push("--result".to_string());
        arg_refs.push(r.clone());
    }
    let refs: Vec<&str> = arg_refs.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), false).await
}

#[command]
pub async fn kanban_create_board(app: AppHandle, slug: String, name: Option<String>, switch_after: Option<bool>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["boards".to_string(), "create".to_string(), slug];
    if let Some(n) = &name { args.extend(["--name".to_string(), n.clone()]); }
    if switch_after.unwrap_or(false) { args.push("--switch".to_string()); }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), false).await
}

#[command]
pub async fn kanban_create_task(app: AppHandle, input: Value, profile: Option<String>) -> Result<Value, String> {
    let title = input.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() { return Ok(json!({ "success": false, "error": "Title is required" })); }
    let mut args = vec!["create".to_string(), title.to_string()];
    if let Some(body) = input.get("body").and_then(|v| v.as_str()) {
        if !body.is_empty() { args.extend(["--body".to_string(), body.to_string()]); }
    }
    if let Some(assignee) = input.get("assignee").and_then(|v| v.as_str()) {
        if !assignee.is_empty() { args.extend(["--assignee".to_string(), assignee.to_string()]); }
    }
    if let Some(pri) = input.get("priority").and_then(|v| v.as_u64()) {
        args.extend(["--priority".to_string(), pri.to_string()]);
    }
    if let Some(tenant) = input.get("tenant").and_then(|v| v.as_str()) {
        if !tenant.is_empty() { args.extend(["--tenant".to_string(), tenant.to_string()]); }
    }
    if let Some(ws) = input.get("workspace").and_then(|v| v.as_str()) {
        if !ws.is_empty() { args.extend(["--workspace".to_string(), ws.to_string()]); }
    }
    if input.get("triage").and_then(|v| v.as_bool()).unwrap_or(false) {
        args.push("--triage".to_string());
    }
    if let Some(retries) = input.get("maxRetries").and_then(|v| v.as_u64()) {
        args.extend(["--max-retries".to_string(), retries.to_string()]);
    }
    if let Some(skills) = input.get("skills").and_then(|v| v.as_array()) {
        for s in skills { if let Some(name) = s.as_str() { args.extend(["--skill".to_string(), name.to_string()]); } }
    }
    args.push("--json".to_string());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), true).await
}

#[command]
pub async fn kanban_current_board(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    let python_path = python::get_python_path(Some(&app));
    let repo_path = python::get_hermes_repo(Some(&app));
    let hermes_home = python::get_hermes_home(Some(&app));
    if !python_path.exists() { return Ok(json!(null)); }
    let mut args = vec!["-m", "hermes_cli.main", "kanban", "boards", "show"];
    if let Some(p) = &profile { if p != "default" { args.extend(["-p", p]); } }
    let output = tokio::process::Command::new(&python_path)
        .args(&args).current_dir(repo_path).env("HERMES_HOME", &hermes_home)
        .output().await.map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(json!(String::from_utf8_lossy(&output.stdout).trim()))
    } else {
        Ok(json!(null))
    }
}

#[command]
pub async fn kanban_dispatch_once(app: AppHandle, dry_run: Option<bool>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["dispatch".to_string(), "--json".to_string()];
    if dry_run.unwrap_or(false) { args.push("--dry-run".to_string()); }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), true).await
}

#[command]
pub async fn kanban_get_task(app: AppHandle, task_id: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["show", &task_id, "--json"], profile.as_deref(), true).await
}

#[command]
pub async fn kanban_list_boards(app: AppHandle, include_archived: Option<bool>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["boards".to_string(), "list".to_string(), "--json".to_string()];
    if include_archived.unwrap_or(false) { args.push("--all".to_string()); }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), true).await
}

#[command]
pub async fn kanban_list_tasks(app: AppHandle, filters: Option<Value>) -> Result<Value, String> {
    let mut args = vec!["list".to_string(), "--json".to_string()];
    if let Some(f) = &filters {
        if let Some(s) = f.get("status").and_then(|v| v.as_str()) { args.extend(["--status".to_string(), s.to_string()]); }
        if let Some(a) = f.get("assignee").and_then(|v| v.as_str()) { args.extend(["--assignee".to_string(), a.to_string()]); }
        if let Some(t) = f.get("tenant").and_then(|v| v.as_str()) { args.extend(["--tenant".to_string(), t.to_string()]); }
        if f.get("includeArchived").and_then(|v| v.as_bool()).unwrap_or(false) { args.push("--archived".to_string()); }
    }
    let profile = filters.as_ref().and_then(|f| f.get("profile")).and_then(|v| v.as_str()).map(|s| s.to_string());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), true).await
}

#[command]
pub async fn kanban_reclaim_task(app: AppHandle, task_id: String, reason: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["reclaim".to_string(), task_id];
    if let Some(r) = &reason { args.extend(["--reason".to_string(), r.clone()]); }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), false).await
}

#[command]
pub async fn kanban_remove_board(app: AppHandle, slug: String, hard_delete: Option<bool>, profile: Option<String>) -> Result<Value, String> {
    let mut args = vec!["boards".to_string(), "rm".to_string(), slug];
    if hard_delete.unwrap_or(false) { args.push("--delete".to_string()); }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_kanban_cli(&app, &refs, profile.as_deref(), false).await
}

#[command]
pub async fn kanban_specify_task(app: AppHandle, task_id: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["specify", &task_id], profile.as_deref(), false).await
}

#[command]
pub async fn kanban_switch_board(app: AppHandle, slug: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["boards", "switch", &slug], profile.as_deref(), false).await
}

#[command]
pub async fn kanban_unblock_task(app: AppHandle, task_id: String, profile: Option<String>) -> Result<Value, String> {
    run_kanban_cli(&app, &["unblock", &task_id], profile.as_deref(), false).await
}
