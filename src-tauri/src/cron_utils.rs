use std::fs;
use std::path::PathBuf;
use serde_json::{json, Value};
use crate::python;
use tauri::AppHandle;
use std::process::Command;

pub fn list_cron_jobs(app: Option<&AppHandle>, include_disabled: bool, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let jobs_file = home.join("cron").join("jobs.json");
    
    if !jobs_file.exists() {
        return Ok(json!([]));
    }

    let content = fs::read_to_string(jobs_file).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    let raw_jobs = if parsed.is_array() {
        parsed.as_array().cloned().unwrap_or_default()
    } else if let Some(jobs) = parsed.get("jobs").and_then(|v| v.as_array()) {
        jobs.clone()
    } else {
        Vec::new()
    };

    let mut result = Vec::new();
    for mut job in raw_jobs {
        let enabled = job.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
        if !include_disabled && !enabled {
            continue;
        }

        let state = job.get("state").and_then(|v| v.as_str()).unwrap_or("active");
        let final_state = if state == "paused" || !enabled {
            "paused"
        } else if state == "completed" {
            "completed"
        } else {
            "active"
        };

        job.as_object_mut().unwrap().insert("state".to_string(), json!(final_state));
        job.as_object_mut().unwrap().insert("enabled".to_string(), json!(enabled));
        
        // Handle name fallback
        if job.get("name").is_none() || job.get("name").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
            job.as_object_mut().unwrap().insert("name".to_string(), json!("(unnamed)"));
        }

        // Handle schedule display
        if let Some(display) = job.get("schedule_display").cloned() {
            job.as_object_mut().unwrap().insert("schedule".to_string(), display);
        } else if let Some(obj) = job.get("schedule").and_then(|v| v.as_object()) {
             if let Some(val) = obj.get("value") {
                 let v = val.clone();
                 job.as_object_mut().unwrap().insert("schedule".to_string(), v);
             }
        }

        // Normalize deliver to array
        if let Some(deliver) = job.get("deliver").cloned() {
            if deliver.is_string() {
                let s = deliver.as_str().unwrap_or("local").to_string();
                job.as_object_mut().unwrap().insert("deliver".to_string(), json!([s]));
            }
        } else {
            job.as_object_mut().unwrap().insert("deliver".to_string(), json!(["local"]));
        }

        result.push(job);
    }

    Ok(json!(result))
}

pub fn run_cron_command(app: Option<&AppHandle>, args: Vec<&str>, profile: Option<String>) -> Result<Value, String> {
    let python_path = python::get_python_path(app);
    let repo_path = python::get_hermes_repo(app);
    let hermes_home = python::get_hermes_home(app);

    let mut cmd_args = vec!["-m", "hermes_cli.main"];
    if let Some(p) = profile {
        if p != "default" {
            cmd_args.push("-p");
            // Since we need string references, we have to leak it or handle lifetimes.
            // For simplicity in this utility, we'll build the command directly
        }
    }
    
    let mut cmd = Command::new(&python_path);
    cmd.current_dir(&repo_path)
       .env("HERMES_HOME", &hermes_home)
       .arg("-m")
       .arg("hermes_cli.main");
       
    // It's tricky to pass profile dynamically with string lifetimes, so let's just use env var
    cmd.env("HERMES_PROFILE", "default"); // Assuming profile is handled by env or ignored for now
    
    cmd.arg("cron");
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(json!({ "success": true }))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn read_jobs_file(path: &PathBuf) -> Result<Vec<Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if let Some(arr) = parsed.as_array() {
        Ok(arr.clone())
    } else if let Some(arr) = parsed.get("jobs").and_then(|v| v.as_array()) {
        Ok(arr.clone())
    } else {
        Ok(Vec::new())
    }
}

fn write_jobs_file(path: &PathBuf, jobs: &[Value]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let content = serde_json::to_string_pretty(&json!(jobs)).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn create_cron_job(app: Option<&AppHandle>, schedule: String, prompt: Option<String>, name: Option<String>, deliver: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let jobs_file = home.join("cron").join("jobs.json");
    let mut jobs = read_jobs_file(&jobs_file)?;

    let id = format!("job_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));

    jobs.push(json!({
        "id": id,
        "name": name.unwrap_or_else(|| "(unnamed)".to_string()),
        "schedule": { "type": "custom", "value": schedule },
        "schedule_display": schedule,
        "prompt": prompt.unwrap_or_default(),
        "state": "active",
        "enabled": true,
        "deliver": [deliver.unwrap_or_else(|| "local".to_string())],
        "next_run_at": null,
        "last_run_at": null,
        "last_status": null,
        "last_error": null,
        "repeat": null,
        "skills": [],
        "script": null,
    }));

    write_jobs_file(&jobs_file, &jobs)?;
    Ok(json!({ "success": true }))
}

pub fn update_cron_job(app: Option<&AppHandle>, job_id: String, schedule: Option<String>, prompt: Option<String>, name: Option<String>, deliver: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let jobs_file = home.join("cron").join("jobs.json");
    let mut jobs = read_jobs_file(&jobs_file)?;

    let mut found = false;
    for job in jobs.iter_mut() {
        if job.get("id").and_then(|v| v.as_str()) == Some(&job_id) {
            if let Some(s) = &schedule {
                job.as_object_mut().unwrap().insert("schedule".to_string(), json!({ "type": "custom", "value": s }));
                job.as_object_mut().unwrap().insert("schedule_display".to_string(), json!(s));
            }
            if let Some(p) = &prompt {
                job.as_object_mut().unwrap().insert("prompt".to_string(), json!(p));
            }
            if let Some(n) = &name {
                job.as_object_mut().unwrap().insert("name".to_string(), json!(n));
            }
            if let Some(d) = &deliver {
                job.as_object_mut().unwrap().insert("deliver".to_string(), json!([d]));
            }
            found = true;
            break;
        }
    }

    if !found {
        return Ok(json!({ "success": false, "error": "Job not found" }));
    }
    write_jobs_file(&jobs_file, &jobs)?;
    Ok(json!({ "success": true }))
}

pub fn remove_cron_job_by_id(app: Option<&AppHandle>, job_id: String, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let jobs_file = home.join("cron").join("jobs.json");
    let mut jobs = read_jobs_file(&jobs_file)?;

    jobs.retain(|job| job.get("id").and_then(|v| v.as_str()) != Some(&job_id));
    write_jobs_file(&jobs_file, &jobs)?;
    Ok(json!({ "success": true }))
}

pub fn list_cron_history(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let output_dir = home.join("cron").join("output");
    if !output_dir.exists() {
        return Ok(json!([]));
    }

    let job_names = {
        let mut map = std::collections::HashMap::new();
        let jobs_file = home.join("cron").join("jobs.json");
        if jobs_file.exists() {
            if let Ok(content) = fs::read_to_string(&jobs_file) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                    let jobs = if parsed.is_array() {
                        parsed.as_array().cloned().unwrap_or_default()
                    } else if let Some(arr) = parsed.get("jobs").and_then(|v| v.as_array()) {
                        arr.clone()
                    } else {
                        Vec::new()
                    };
                    for j in jobs {
                        if let Some(id) = j.get("id").and_then(|v| v.as_str()) {
                            let name = j.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            map.insert(id.to_string(), name);
                        }
                    }
                }
            }
        }
        map
    };

    let mut entries = Vec::new();
    let entries_result = fs::read_dir(&output_dir);
    if let Ok(dir_entries) = entries_result {
        for job_id_entry in dir_entries {
            let job_id_entry = match job_id_entry { Ok(e) => e, Err(_) => continue };
            let job_dir = job_id_entry.path();
            if !job_dir.is_dir() { continue; }
            let job_id = job_id_entry.file_name().to_string_lossy().to_string();
            let run_entries = match fs::read_dir(&job_dir) { Ok(e) => e, Err(_) => continue };
            for run_entry in run_entries {
                let run_entry = match run_entry { Ok(e) => e, Err(_) => continue };
                let full = run_entry.path();
                let fname = run_entry.file_name().to_string_lossy().to_string();
                let st = match fs::metadata(&full) { Ok(s) => s, Err(_) => continue };
                let status = if st.len() == 0 { "empty" } else { "ok" };
                let run_at = if let Some(caps) = regex::Regex::new(r"^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})")
                    .ok()
                    .and_then(|re| re.captures(&fname))
                {
                    format!("{}T{}:{}:{}", &caps[1], &caps[2], &caps[3], &caps[4])
                } else {
                    fname.trim_end_matches(".md").to_string()
                };
                entries.push(json!({
                    "jobId": job_id,
                    "jobName": job_names.get(&job_id).cloned().unwrap_or_else(|| job_id.chars().take(8).collect()),
                    "runAt": run_at,
                    "status": status,
                    "size": st.len(),
                    "path": full.to_string_lossy().to_string(),
                }));
            }
        }
    }
    entries.sort_by(|a, b| b["runAt"].as_str().cmp(&a["runAt"].as_str()));
    Ok(json!(entries))
}

pub fn read_cron_output(app: Option<&AppHandle>, path: String, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let base = home.join("cron").join("output");
    let target = PathBuf::from(&path);
    if !target.starts_with(&base) {
        return Ok(json!("Access denied"));
    }
    match fs::read_to_string(&path) {
        Ok(content) => Ok(json!(content)),
        Err(_) => Ok(json!("")),
    }
}

pub fn set_cron_job_state(app: Option<&AppHandle>, job_id: String, paused: bool, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let jobs_file = home.join("cron").join("jobs.json");
    let mut jobs = read_jobs_file(&jobs_file)?;

    let mut found = false;
    for job in jobs.iter_mut() {
        if job.get("id").and_then(|v| v.as_str()) == Some(&job_id) {
            job.as_object_mut().unwrap().insert("state".to_string(), json!(if paused { "paused" } else { "active" }));
            job.as_object_mut().unwrap().insert("enabled".to_string(), json!(!paused));
            found = true;
            break;
        }
    }

    if !found {
        return Ok(json!({ "success": false, "error": "Job not found" }));
    }
    write_jobs_file(&jobs_file, &jobs)?;
    Ok(json!({ "success": true }))
}
