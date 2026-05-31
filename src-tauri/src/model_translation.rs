use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::AppHandle;

use crate::model_store::{ClientProvider, ClientModel, ModelConfigStore};
use crate::model_utils::{read_yaml, write_yaml};

/// Build config.yaml sections from a ModelConfigStore.
/// Returns a BTreeMap representing the model/provider/alias sections of config.yaml.
pub fn translate_to_yaml(store: &ModelConfigStore) -> BTreeMap<String, Value> {
    let mut root: BTreeMap<String, Value> = BTreeMap::new();

    // 1. Write model.default section
    if !store.default_model.is_empty() {
        if let Some(default_model) = store.models.get(&store.default_model) {
            if let Some(default_provider) = store.providers.get(&default_model.provider_id) {
                root.insert(
                    "model".to_string(),
                    json!({
                        "default": default_model.model_id,
                        "provider": default_provider.provider_key,
                        "base_url": default_provider.base_url,
                        "max_tokens": 65536,
                    }),
                );
            }
        }
    }

    // 2. Group models by provider → write providers section
    let mut providers_json = serde_json::Map::new();
    for (_model_id, model) in &store.models {
        let provider = match store.providers.get(&model.provider_id) {
            Some(p) => p,
            None => continue,
        };

        let entry = providers_json
            .entry(provider.provider_key.clone())
            .or_insert_with(|| {
                json!({
                    "base_url": provider.base_url,
                    "models": {},
                })
            });

        if let Some(models_map) = entry
            .get_mut("models")
            .and_then(|m| m.as_object_mut())
        {
            let mut model_entry = json!({});
            if model.context_length > 0 {
                model_entry["context_length"] = json!(model.context_length);
            }
            models_map.insert(model.model_id.clone(), model_entry);
        }
    }
    if !providers_json.is_empty() {
        root.insert("providers".to_string(), json!(providers_json));
    }

    // 3. Write model_aliases (only models with non-empty alias)
    let mut aliases_json = serde_json::Map::new();
    for (_model_id, model) in &store.models {
        if model.alias.is_empty() {
            continue;
        }
        let provider = match store.providers.get(&model.provider_id) {
            Some(p) => p,
            None => continue,
        };
        let ctx_len = if model.context_length > 0 {
            model.context_length
        } else {
            200000
        };
        aliases_json.insert(
            model.alias.clone(),
            json!({
                "model": model.model_id,
                "base_url": provider.base_url,
                "context_length": ctx_len,
            }),
        );
    }
    if !aliases_json.is_empty() {
        root.insert("model_aliases".to_string(), json!(aliases_json));
    }

    root
}

/// Given the raw config.yaml data, build a ModelConfigStore representing what's in the yaml.
/// Providers and models get auto-generated UUIDs; aliases are applied to matching models.
pub fn translate_from_yaml(yaml: &BTreeMap<String, Value>) -> ModelConfigStore {
    let now = now_ms();
    let mut store = ModelConfigStore::default();

    // 1. Extract default model
    store.default_model = yaml
        .get("model")
        .and_then(|m| m.get("default"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 2. Extract providers and models
    if let Some(providers_yaml) = yaml.get("providers").and_then(|v| v.as_object()) {
        for (prov_key, prov_val) in providers_yaml {
            let base_url = prov_val
                .get("base_url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let provider_id = uuid::Uuid::new_v4().to_string();

            store.providers.insert(
                provider_id.clone(),
                ClientProvider {
                    id: provider_id.clone(),
                    name: prov_key.clone(),
                    base_url: base_url.clone(),
                    provider_key: prov_key.clone(),
                    api_key_env_var: infer_env_var(prov_key),
                    created_at: now,
                    updated_at: now,
                },
            );

            // 3. Extract models for this provider
            if let Some(models_yaml) = prov_val.get("models").and_then(|v| v.as_object()) {
                for (model_id_str, _model_val) in models_yaml {
                    store.models.insert(
                        uuid::Uuid::new_v4().to_string(),
                        ClientModel {
                            id: uuid::Uuid::new_v4().to_string(),
                            provider_id: provider_id.clone(),
                            model_id: model_id_str.clone(),
                            alias: String::new(),
                            categories: vec![],
                            context_length: 0,
                            discovered: false,
                            created_at: now,
                            updated_at: now,
                        },
                    );
                }
            }
        }
    }

    // 4. Extract aliases from model_aliases → set alias on matching models
    if let Some(aliases_yaml) = yaml.get("model_aliases").and_then(|v| v.as_object()) {
        for (alias_name, alias_val) in aliases_yaml {
            let alias_model = alias_val
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let alias_base_url = alias_val
                .get("base_url")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if alias_model.is_empty() {
                continue;
            }

            // Find matching model: same model_id and same provider base_url
            for (_model_id, model) in store.models.iter_mut() {
                if model.model_id != alias_model {
                    continue;
                }
                let provider = match store.providers.get(&model.provider_id) {
                    Some(p) => p,
                    None => continue,
                };
                if provider.base_url == alias_base_url {
                    if model.alias.is_empty() {
                        model.alias = alias_name.clone();
                    }
                    break;
                }
            }
        }
    }

    store
}

/// Merge two stores: keep client-only fields (categories, timestamps, alias, discovered)
/// from `existing`, update structural data (provider list, model list) from `from_yaml`.
pub fn merge_stores(
    existing: &ModelConfigStore,
    from_yaml: &ModelConfigStore,
) -> ModelConfigStore {
    let now = now_ms();
    let mut merged = ModelConfigStore {
        version: existing.version.max(from_yaml.version),
        default_model: from_yaml.default_model.clone(),
        providers: std::collections::HashMap::new(),
        models: std::collections::HashMap::new(),
    };

    // Merge providers: prefer existing client fields, update from yaml
    for (yaml_id, yaml_prov) in &from_yaml.providers {
        // Try to find matching provider by provider_key in existing store
        let existing_prov = existing
            .providers
            .values()
            .find(|p| p.provider_key == yaml_prov.provider_key);

        let provider_id = existing_prov.map(|p| p.id.clone()).unwrap_or_else(|| yaml_id.clone());

        merged.providers.insert(
            provider_id.clone(),
            ClientProvider {
                id: provider_id.clone(),
                name: existing_prov
                    .map(|p| p.name.clone())
                    .unwrap_or_else(|| yaml_prov.name.clone()),
                base_url: yaml_prov.base_url.clone(),
                provider_key: yaml_prov.provider_key.clone(),
                api_key_env_var: existing_prov
                    .map(|p| p.api_key_env_var.clone())
                    .unwrap_or_else(|| yaml_prov.api_key_env_var.clone()),
                created_at: existing_prov
                    .map(|p| p.created_at)
                    .unwrap_or(yaml_prov.created_at),
                updated_at: now,
            },
        );
    }

    // Also keep providers that exist in existing but not in yaml
    for (exist_id, exist_prov) in &existing.providers {
        let found = merged
            .providers
            .values()
            .any(|p| p.provider_key == exist_prov.provider_key);
        if !found {
            merged.providers.insert(exist_id.clone(), exist_prov.clone());
        }
    }

    // Merge models: prefer existing client fields, update from yaml
    for (yaml_id, yaml_model) in &from_yaml.models {
        let yaml_prov_key = from_yaml
            .providers
            .get(&yaml_model.provider_id)
            .map(|p| p.provider_key.clone());

        // Find matching model in existing store
        let existing_model = existing.models.values().find(|m| {
            if let Some(ref ypk) = yaml_prov_key {
                let exist_prov = existing.providers.get(&m.provider_id);
                if let Some(ep) = exist_prov {
                    return ep.provider_key == *ypk && m.model_id == yaml_model.model_id;
                }
            }
            m.provider_id == yaml_model.provider_id && m.model_id == yaml_model.model_id
        });

        let merged_provider_id = existing_model
            .map(|m| m.provider_id.clone())
            .or_else(|| {
                // Map yaml provider_id to merged provider_id via provider_key
                yaml_prov_key.as_ref().and_then(|ypk| {
                    merged
                        .providers
                        .values()
                        .find(|p| p.provider_key == *ypk)
                        .map(|p| p.id.clone())
                })
            })
            .unwrap_or_else(|| yaml_model.provider_id.clone());

        let model_id = existing_model
            .map(|m| m.id.clone())
            .unwrap_or_else(|| yaml_id.clone());

        merged.models.insert(
            model_id.clone(),
            ClientModel {
                id: model_id,
                provider_id: merged_provider_id,
                model_id: yaml_model.model_id.clone(),
                alias: existing_model
                    .map(|m| m.alias.clone())
                    .unwrap_or_default(),
                categories: existing_model
                    .map(|m| m.categories.clone())
                    .unwrap_or_default(),
                context_length: existing_model
                    .map(|m| m.context_length)
                    .unwrap_or(yaml_model.context_length),
                discovered: existing_model
                    .map(|m| m.discovered)
                    .unwrap_or(yaml_model.discovered),
                created_at: existing_model
                    .map(|m| m.created_at)
                    .unwrap_or(yaml_model.created_at),
                updated_at: now,
            },
        );
    }

    // Also keep models that exist in existing but not in yaml
    for (exist_id, exist_model) in &existing.models {
        let exist_prov = existing.providers.get(&exist_model.provider_id);
        let exist_prov_key = exist_prov.map(|p| p.provider_key.clone());

        let found = merged.models.values().any(|m| {
            if let Some(ref epk) = exist_prov_key {
                let merged_prov = merged.providers.get(&m.provider_id);
                if let Some(mp) = merged_prov {
                    return mp.provider_key == *epk && m.model_id == exist_model.model_id;
                }
            }
            m.provider_id == exist_model.provider_id && m.model_id == exist_model.model_id
        });

        if !found {
            // Re-map provider_id to merged provider
            let merged_prov_id = exist_prov_key
                .as_ref()
                .and_then(|epk| {
                    merged
                        .providers
                        .values()
                        .find(|p| p.provider_key == *epk)
                        .map(|p| p.id.clone())
                })
                .unwrap_or_else(|| exist_model.provider_id.clone());

            merged.models.insert(
                exist_id.clone(),
                ClientModel {
                    id: exist_id.clone(),
                    provider_id: merged_prov_id,
                    ..exist_model.clone()
                },
            );
        }
    }

    merged
}

/// Read the store, translate to yaml sections, merge with existing config.yaml,
/// and write back — preserving non-model sections.
pub fn sync_to_config_yaml(
    app: Option<&AppHandle>,
    store: &ModelConfigStore,
    profile: Option<String>,
) -> Result<(), String> {
    // 1. Read existing config.yaml to preserve non-model sections
    let mut root = read_yaml(app, profile.clone())?;

    // 2. Translate store → config.yaml sections
    let translated = translate_to_yaml(store);

    // 3. Merge translated sections into root, preserving other sections
    for (key, value) in translated {
        if key == "model" {
            if let Some(existing_model) = root.get("model") {
                if let Some(existing_tokens) = existing_model.get("max_tokens") {
                    let mut merged_model = value;
                    if let Some(obj) = merged_model.as_object_mut() {
                        obj.insert(
                            "max_tokens".to_string(),
                            existing_tokens.clone(),
                        );
                    }
                    root.insert(key, merged_model);
                    continue;
                }
            }
        }
        root.insert(key, value);
    }

    // 4. Write back
    write_yaml(app, profile, &root)
}

// ── helpers ──

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn infer_env_var(provider_key: &str) -> String {
    let upper = provider_key.to_uppercase().replace('-', "_");
    format!("{}_API_KEY", upper)
}
