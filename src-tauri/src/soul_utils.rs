use std::fs;
use serde_json::{json, Value};
use crate::python;
use tauri::AppHandle;

pub fn read_soul(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let soul_file = home.join("SOUL.md");
    if !soul_file.exists() {
        return Ok(json!(""));
    }
    fs::read_to_string(soul_file)
        .map(|s| json!(s))
        .map_err(|e| e.to_string())
}

pub fn write_soul(app: Option<&AppHandle>, text: String, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let soul_file = home.join("SOUL.md");
    fs::write(soul_file, text)
        .map(|_| Value::Null)
        .map_err(|e| e.to_string())
}

pub fn reset_soul(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let soul_file = home.join("SOUL.md");
    if soul_file.exists() {
        fs::remove_file(soul_file).map_err(|e| e.to_string())?;
    }
    Ok(json!(""))
}
