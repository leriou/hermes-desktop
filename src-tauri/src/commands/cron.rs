use serde_json::{Value};
use tauri::{command, AppHandle};
#[command]
pub async fn create_cron_job(app: AppHandle, schedule: String, prompt: Option<String>, name: Option<String>, deliver: Option<String>, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::create_cron_job(Some(&app), schedule, prompt, name, deliver, profile)
}

#[command]
pub async fn list_cron_jobs(app: AppHandle, include_disabled: Option<bool>, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::list_cron_jobs(Some(&app), include_disabled.unwrap_or(true), profile)
}

#[command]
pub async fn pause_cron_job(app: AppHandle, job_id: String, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::set_cron_job_state(Some(&app), job_id, true, profile)
}

#[command]
pub async fn list_cron_history(app: AppHandle, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::list_cron_history(Some(&app), profile)
}

#[command]
pub async fn read_cron_output(app: AppHandle, path: String, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::read_cron_output(Some(&app), path, profile)
}

#[command]
pub async fn remove_cron_job(app: AppHandle, job_id: String, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::remove_cron_job_by_id(Some(&app), job_id, profile)
}

#[command]
pub async fn resume_cron_job(app: AppHandle, job_id: String, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::set_cron_job_state(Some(&app), job_id, false, profile)
}

#[command]
pub async fn trigger_cron_job(app: AppHandle, job_id: String, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::run_cron_command(Some(&app), vec!["run", &job_id], profile)
}

#[command]
pub async fn update_cron_job(app: AppHandle, job_id: String, schedule: Option<String>, prompt: Option<String>, name: Option<String>, deliver: Option<String>, profile: Option<String>) -> Result<Value, String> {
    crate::cron_utils::update_cron_job(Some(&app), job_id, schedule, prompt, name, deliver, profile)
}
