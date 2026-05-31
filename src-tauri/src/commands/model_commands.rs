use serde_json::{json, Value};
use tauri::{command, AppHandle};

use crate::config_utils;
use crate::model_store::{self, ClientModel, ClientProvider, ModelConfigStore};
use crate::model_translation;
use crate::python;

/// Load the full model store from desktop-models.json, merge with config.yaml,
/// and return as JSON.
#[command]
pub async fn read_model_store(
    app: AppHandle,
    profile: Option<String>,
) -> Result<Value, String> {
    // 1. Read desktop-models.json
    let existing = model_store::read_model_store(Some(&app), profile.clone())?;

    // 2. Read config.yaml and build store from yaml
    let yaml = match crate::model_utils::read_yaml(Some(&app), profile.clone()) {
        Ok(y) => y,
        Err(e) => {
            log::warn!("Failed to read config.yaml: {}, using yaml-only store", e);
            std::collections::BTreeMap::new()
        }
    };

    if yaml.is_empty() {
        // No config.yaml — return existing store as-is
        return serde_json::to_value(&existing)
            .map_err(|e| format!("Failed to serialize store: {}", e));
    }

    let from_yaml = model_translation::translate_from_yaml(&yaml);
    let merged = model_translation::merge_stores(&existing, &from_yaml);

    // 3. Save the merged store back to desktop-models.json
    if let Err(e) = model_store::write_model_store(Some(&app), &merged, profile) {
        log::error!("Failed to write merged store back: {}", e);
    }

    serde_json::to_value(&merged).map_err(|e| format!("Failed to serialize store: {}", e))
}

/// Write the full model store to desktop-models.json and sync to config.yaml.
#[command]
pub async fn write_model_store(
    app: AppHandle,
    store: Value,
    profile: Option<String>,
) -> Result<Value, String> {
    let model_store: ModelConfigStore = serde_json::from_value(store)
        .map_err(|e| format!("Failed to deserialize store: {}", e))?;

    model_store::write_model_store(Some(&app), &model_store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &model_store, profile)?;

    Ok(json!({"success": true}))
}

/// Register a new provider: create ClientProvider, write API key to .env, save store, sync config.
#[command]
pub async fn register_provider(
    app: AppHandle,
    input: Value,
    profile: Option<String>,
) -> Result<Value, String> {
    let name = input
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let base_url = input
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let provider_key = input
        .get("providerKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_key_env_var = input
        .get("apiKeyEnvVar")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_key = input
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if name.is_empty() {
        return Err("Provider name is required".to_string());
    }
    if provider_key.is_empty() {
        return Err("Provider key is required".to_string());
    }

    // Read existing store
    let mut store = model_store::read_model_store(Some(&app), profile.clone())?;

    // Check for duplicate provider_key
    if store.providers.values().any(|p| p.provider_key == provider_key) {
        return Err(format!("Provider with key '{}' already exists", provider_key));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let provider = ClientProvider {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        base_url: base_url.clone(),
        provider_key: provider_key.clone(),
        api_key_env_var: api_key_env_var.clone(),
        created_at: now,
        updated_at: now,
    };

    // Write API key to .env if provided
    if !api_key.is_empty() && !api_key_env_var.is_empty() {
        let home = python::get_hermes_home_with_profile(Some(&app), profile.clone());
        if !home.exists() {
            std::fs::create_dir_all(&home)
                .map_err(|e| format!("Failed to create profile directory: {}", e))?;
        }
        let env_path = home.join(".env");
        config_utils::set_env_value(&env_path, &api_key_env_var, &api_key)
            .map_err(|e| format!("Failed to write API key to .env: {}", e))?;
        log::info!("Wrote API key for '{}' to .env as {}", provider_key, api_key_env_var);
    }

    let provider_json = serde_json::to_value(&provider)
        .map_err(|e| format!("Failed to serialize provider: {}", e))?;

    store.providers.insert(provider.id.clone(), provider);
    model_store::write_model_store(Some(&app), &store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &store, profile)?;

    log::info!("Registered provider: {} ({})", name, provider_key);
    Ok(provider_json)
}

/// Create or update a ClientModel, then sync to config.yaml.
#[command]
pub async fn save_model(
    app: AppHandle,
    input: Value,
    profile: Option<String>,
) -> Result<Value, String> {
    let provider_id = input
        .get("providerId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model_id_str = input
        .get("modelId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let alias = input
        .get("alias")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let categories: Vec<String> = input
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let context_length = input
        .get("contextLength")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let discovered = input
        .get("discovered")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if provider_id.is_empty() {
        return Err("providerId is required".to_string());
    }
    if model_id_str.is_empty() {
        return Err("modelId is required".to_string());
    }

    let mut store = model_store::read_model_store(Some(&app), profile.clone())?;

    // Verify provider exists
    if !store.providers.contains_key(&provider_id) {
        return Err(format!("Provider '{}' not found", provider_id));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    // Find existing model or create new one
    let existing = store
        .models
        .values()
        .find(|m| m.provider_id == provider_id && m.model_id == model_id_str);

    let model = if let Some(existing) = existing {
        let model_id = existing.id.clone();
        let updated = ClientModel {
            id: model_id.clone(),
            provider_id: provider_id.clone(),
            model_id: model_id_str.clone(),
            alias: if input.get("alias").is_some() {
                alias
            } else {
                existing.alias.clone()
            },
            categories: if input.get("categories").is_some() {
                categories
            } else {
                existing.categories.clone()
            },
            context_length: if input.get("contextLength").is_some() {
                context_length
            } else {
                existing.context_length
            },
            discovered,
            created_at: existing.created_at,
            updated_at: now,
        };
        updated
    } else {
        ClientModel {
            id: uuid::Uuid::new_v4().to_string(),
            provider_id: provider_id.clone(),
            model_id: model_id_str.clone(),
            alias,
            categories,
            context_length,
            discovered,
            created_at: now,
            updated_at: now,
        }
    };

    let model_json = serde_json::to_value(&model)
        .map_err(|e| format!("Failed to serialize model: {}", e))?;

    store.models.insert(model.id.clone(), model);
    model_store::write_model_store(Some(&app), &store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &store, profile)?;

    log::info!("Saved model: {} (provider={})", model_id_str, provider_id);
    Ok(model_json)
}

/// Delete a ClientModel from the store and sync config.yaml.
#[command]
pub async fn delete_model(
    app: AppHandle,
    model_id: String,
    provider_id: String,
    profile: Option<String>,
) -> Result<Value, String> {
    if model_id.is_empty() {
        return Err("model_id is required".to_string());
    }

    let mut store = model_store::read_model_store(Some(&app), profile.clone())?;

    // Verify the model belongs to the specified provider
    if let Some(model) = store.models.get(&model_id) {
        if !provider_id.is_empty() && model.provider_id != provider_id {
            return Err(format!(
                "Model '{}' does not belong to provider '{}'",
                model_id, provider_id
            ));
        }
    }

    if store.models.remove(&model_id).is_none() {
        return Err(format!("Model '{}' not found", model_id));
    }

    // Clear default_model if it references the deleted model
    if store.default_model == model_id {
        store.default_model = String::new();
    }

    model_store::write_model_store(Some(&app), &store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &store, profile)?;

    log::info!("Deleted model: {}", model_id);
    Ok(json!({"success": true}))
}

/// Unregister a provider and cascade-delete all its models.
#[command]
pub async fn unregister_provider(
    app: AppHandle,
    provider_id: String,
    profile: Option<String>,
) -> Result<Value, String> {
    if provider_id.is_empty() {
        return Err("provider_id is required".to_string());
    }

    let mut store = model_store::read_model_store(Some(&app), profile.clone())?;

    if store.providers.remove(&provider_id).is_none() {
        return Err(format!("Provider '{}' not found", provider_id));
    }

    // Cascade-delete all models belonging to this provider
    let model_ids: Vec<String> = store
        .models
        .iter()
        .filter(|(_, m)| m.provider_id == provider_id)
        .map(|(id, _)| id.clone())
        .collect();

    for mid in &model_ids {
        store.models.remove(mid);
    }

    // Clear default_model if it was one of the deleted models
    if !store.default_model.is_empty() && model_ids.contains(&store.default_model) {
        store.default_model = String::new();
    }

    model_store::write_model_store(Some(&app), &store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &store, profile)?;

    log::info!(
        "Unregistered provider '{}' and {} models",
        provider_id,
        model_ids.len()
    );
    Ok(json!({"success": true, "deletedModels": model_ids.len()}))
}

/// Check if legacy model config exists that needs migration
#[command]
pub async fn check_needs_migration(
    app: AppHandle,
    profile: Option<String>,
) -> Result<Value, String> {
    let store = model_store::read_model_store(Some(&app), profile.clone())?;
    let needs_migration = store.providers.is_empty() && store.models.is_empty();

    // Check if config.yaml has any providers/models (legacy)
    let yaml = crate::model_utils::read_yaml(Some(&app), profile);
    let has_legacy = yaml
        .as_ref()
        .ok()
        .map(|y| y.contains_key("providers"))
        .unwrap_or(false);

    let needs = needs_migration && has_legacy;
    Ok(json!({
        "needsMigration": needs,
        "legacyModelCount": 0,
        "providerCount": 0
    }))
}

/// Migrate legacy config.yaml model config to desktop-models.json
#[command]
pub async fn run_model_migration(
    app: AppHandle,
    profile: Option<String>,
) -> Result<Value, String> {
    let yaml = crate::model_utils::read_yaml(Some(&app), profile.clone())
        .map_err(|e| format!("Failed to read config.yaml: {}", e))?;
    let new_store = model_translation::translate_from_yaml(&yaml);
    model_store::write_model_store(Some(&app), &new_store, profile.clone())?;
    model_translation::sync_to_config_yaml(Some(&app), &new_store, profile)?;
    serde_json::to_value(new_store).map_err(|e| e.to_string())
}
