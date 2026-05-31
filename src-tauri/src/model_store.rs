use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use crate::python;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientProvider {
    pub id: String,
    pub name: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "providerKey")]
    pub provider_key: String,
    #[serde(rename = "apiKeyEnvVar")]
    pub api_key_env_var: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModel {
    pub id: String,
    #[serde(rename = "providerId")]
    pub provider_id: String,
    #[serde(rename = "modelId")]
    pub model_id: String,
    #[serde(default)]
    pub alias: String,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(rename = "contextLength")]
    pub context_length: i64,
    #[serde(default)]
    pub discovered: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfigStore {
    pub version: u32,
    #[serde(rename = "defaultModel")]
    pub default_model: String,
    pub providers: HashMap<String, ClientProvider>,
    pub models: HashMap<String, ClientModel>,
}

impl Default for ModelConfigStore {
    fn default() -> Self {
        Self {
            version: 1,
            default_model: String::new(),
            providers: HashMap::new(),
            models: HashMap::new(),
        }
    }
}

pub fn read_model_store(
    app: Option<&AppHandle>,
    profile: Option<String>,
) -> Result<ModelConfigStore, String> {
    let path = python::get_hermes_home_with_profile(app, profile).join("desktop-models.json");
    if !path.exists() {
        log::info!("desktop-models.json not found at {:?}, returning empty store", path);
        return Ok(ModelConfigStore::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read desktop-models.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse desktop-models.json: {}", e))
}

pub fn write_model_store(
    app: Option<&AppHandle>,
    store: &ModelConfigStore,
    profile: Option<String>,
) -> Result<(), String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    if !home.exists() {
        fs::create_dir_all(&home)
            .map_err(|e| format!("Failed to create profile directory: {}", e))?;
    }
    let path = home.join("desktop-models.json");
    let content = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize ModelConfigStore: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write desktop-models.json: {}", e))?;
    log::info!("Wrote desktop-models.json to {:?}", path);
    Ok(())
}
