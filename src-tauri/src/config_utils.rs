use std::path::Path;
use crate::python;
use tauri::AppHandle;

pub use hermes_core::config::{ConnectionConfig, ModelAlias};

pub fn read_desktop_config(app: &AppHandle) -> serde_json::Value {
    let desktop_json_path = python::get_hermes_home(Some(app)).join("desktop.json");
    hermes_core::config::read_desktop_config(&desktop_json_path)
}

pub fn get_connection_config(app: &AppHandle) -> ConnectionConfig {
    let desktop_json_path = python::get_hermes_home(Some(app)).join("desktop.json");
    hermes_core::config::get_connection_config(&desktop_json_path)
}

pub fn read_env(env_path: &Path) -> std::collections::HashMap<String, String> {
    hermes_core::config::read_env(env_path)
}

pub fn set_env_value(env_path: &Path, key: &str, value: &str) -> std::io::Result<()> {
    hermes_core::config::set_env_value(env_path, key, value)
}

pub fn get_yaml_path(content: &str, dotted_key: &str) -> Option<String> {
    hermes_core::config::get_yaml_path(content, dotted_key)
}

pub fn set_yaml_value(content: &str, key: &str, value: &str) -> String {
    hermes_core::config::set_yaml_value(content, key, value)
}

pub fn get_model_aliases(content: &str) -> Vec<ModelAlias> {
    hermes_core::config::get_model_aliases(content)
}

pub fn parse_enabled_toolsets(content: &str) -> std::collections::HashSet<String> {
    hermes_core::config::parse_enabled_toolsets(content)
}

pub fn set_toolsets_enabled(content: &str, key: &str, enabled: bool) -> Option<String> {
    hermes_core::config::set_toolsets_enabled(content, key, enabled)
}

pub fn list_mcp_servers(content: &str) -> Vec<serde_json::Value> {
    hermes_core::config::list_mcp_servers(content)
}

