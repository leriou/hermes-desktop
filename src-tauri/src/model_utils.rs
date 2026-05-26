use serde_json::{json, Value};
use serde_yaml;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use crate::python;
use tauri::AppHandle;

fn config_path(app: Option<&AppHandle>, profile: Option<String>) -> std::path::PathBuf {
    python::get_hermes_home_with_profile(app, profile).join("config.yaml")
}

fn read_yaml(app: Option<&AppHandle>, profile: Option<String>) -> Result<BTreeMap<String, Value>, String> {
    let path = config_path(app, profile);
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let yaml_val: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
    let json_val: Value = serde_json::to_value(&yaml_val).map_err(|e| e.to_string())?;
    let map = json_val.as_object().cloned().unwrap_or_default();
    Ok(map.into_iter().collect())
}

fn write_yaml(app: Option<&AppHandle>, profile: Option<String>, root: &BTreeMap<String, Value>) -> Result<(), String> {
    let json_obj: serde_json::Map<String, Value> = root.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    let json_val = Value::Object(json_obj);
    let yaml_val: serde_yaml::Value = serde_json::from_value(json_val).map_err(|e| e.to_string())?;
    let yaml_str = serde_yaml::to_string(&yaml_val).map_err(|e| e.to_string())?;
    fs::write(config_path(app, profile), yaml_str).map_err(|e| e.to_string())
}

fn build_alias_map(root: &BTreeMap<String, Value>) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    let aliases = match root.get("model_aliases") {
        Some(v) => v.as_object().cloned().unwrap_or_default(),
        None => return map,
    };
    for (alias_name, alias_val) in &aliases {
        let model_id = alias_val.get("model").and_then(|v| v.as_str()).unwrap_or("");
        let base_url = alias_val.get("base_url").and_then(|v| v.as_str()).unwrap_or("");
        if model_id.is_empty() { continue; }
        let key = format!("{}::{}", base_url, model_id);
        map.entry(key).or_default().push(alias_name.clone());
    }
    map
}

fn find_aliases(alias_map: &HashMap<String, Vec<String>>, model_id: &str, base_url: &str) -> Vec<String> {
    let key = format!("{}::{}", base_url, model_id);
    alias_map.get(&key).cloned().unwrap_or_default()
}

pub fn list_models(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let root = read_yaml(app, profile)?;
    let mut models: Vec<Value> = Vec::new();
    let alias_map = build_alias_map(&root);

    // 1. Default model
    if let Some(model_sec) = root.get("model") {
        let default_model = model_sec.get("default").and_then(|v| v.as_str()).unwrap_or("");
        let default_provider = model_sec.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let default_base_url = model_sec.get("base_url").and_then(|v| v.as_str()).unwrap_or("");
        if !default_model.is_empty() {
            let aliases = find_aliases(&alias_map, default_model, default_base_url);
            models.push(json!({
                "id": format!("default:{}", default_model),
                "name": default_model,
                "provider": default_provider,
                "model": default_model,
                "baseUrl": default_base_url,
                "aliases": aliases,
            }));
        }
    }

    // 2. Provider models
    if let Some(providers) = root.get("providers") {
        if let Some(prov_map) = providers.as_object() {
            for (prov_name, prov_val) in prov_map {
                let base_url = prov_val.get("base_url").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(models_map) = prov_val.get("models").and_then(|v| v.as_object()) {
                    for (model_id, _) in models_map {
                        let aliases = find_aliases(&alias_map, model_id, base_url);
                        models.push(json!({
                            "id": format!("{}:{}", prov_name, model_id),
                            "name": model_id,
                            "provider": format!("custom:{}", prov_name),
                            "model": model_id,
                            "baseUrl": base_url,
                            "aliases": aliases,
                        }));
                    }
                }
            }
        }
    }

    Ok(json!(models))
}

pub fn add_model(app: Option<&AppHandle>, _name: String, provider: String, model: String, base_url: String, alias: Option<String>, profile: Option<String>) -> Result<Value, String> {
    let mut root = read_yaml(app, profile.clone())?;

    let prov_name = provider.strip_prefix("custom:").unwrap_or(&provider).to_string();
    let model_id = if model.is_empty() { _name.clone() } else { model.clone() };

    if !root.contains_key("providers") {
        root.insert("providers".to_string(), json!({}));
    }
    let providers = root.get_mut("providers").unwrap();
    if let Some(prov_map) = providers.as_object_mut() {
        if !prov_map.contains_key(&prov_name) {
            prov_map.insert(prov_name.clone(), json!({ "base_url": base_url, "models": {} }));
        }
        let prov_entry = prov_map.get_mut(&prov_name).unwrap();
        if let Some(base) = prov_entry.as_object_mut() {
            if !base_url.is_empty() {
                base.insert("base_url".to_string(), json!(base_url));
            }
            if !base.contains_key("models") {
                base.insert("models".to_string(), json!({}));
            }
            if let Some(models_map) = base.get_mut("models").unwrap().as_object_mut() {
                if !models_map.contains_key(&model_id) {
                    models_map.insert(model_id.clone(), json!({}));
                }
            }
        }
    }

    if let Some(a) = &alias {
        let trimmed = a.trim();
        if !trimmed.is_empty() {
            if !root.contains_key("model_aliases") {
                root.insert("model_aliases".to_string(), json!({}));
            }
            if let Some(aliases_map) = root.get_mut("model_aliases").unwrap().as_object_mut() {
                aliases_map.insert(trimmed.to_string(), json!({
                    "model": model_id,
                    "base_url": base_url,
                    "context_length": 200000
                }));
            }
        }
    }

    write_yaml(app, profile, &root)?;
    Ok(json!({ "success": true }))
}

pub fn remove_model(app: Option<&AppHandle>, id: String, profile: Option<String>) -> Result<Value, String> {
    let mut root = read_yaml(app, profile.clone())?;

    if let Some(rest) = id.strip_prefix("default:") {
        if let Some(model_sec) = root.get_mut("model") {
            if let Some(obj) = model_sec.as_object_mut() {
                let cur = obj.get("default").and_then(|v| v.as_str()).unwrap_or("");
                if cur == rest {
                    obj.remove("default");
                }
            }
        }
    } else if let Some((prov_name, model_id)) = id.split_once(':') {
        if let Some(providers) = root.get_mut("providers") {
            if let Some(prov_map) = providers.as_object_mut() {
                if let Some(prov_entry) = prov_map.get_mut(prov_name) {
                    if let Some(models) = prov_entry.get_mut("models") {
                        if let Some(models_map) = models.as_object_mut() {
                            models_map.remove(model_id);
                        }
                    }
                }
            }
        }
    }

    write_yaml(app, profile, &root)?;
    Ok(json!({ "success": true }))
}

pub fn update_model(app: Option<&AppHandle>, id: String, fields: Value, profile: Option<String>) -> Result<Value, String> {
    let mut root = read_yaml(app, profile.clone())?;

    let new_model = fields.get("model").and_then(|v| v.as_str());
    let new_base_url = fields.get("baseUrl").and_then(|v| v.as_str());

    if let Some(_rest) = id.strip_prefix("default:") {
        if let Some(model_sec) = root.get_mut("model") {
            if let Some(obj) = model_sec.as_object_mut() {
                if let Some(m) = new_model { obj.insert("default".to_string(), json!(m)); }
                if let Some(b) = new_base_url { obj.insert("base_url".to_string(), json!(b)); }
            }
        }
    } else if let Some((prov_name, old_model_id)) = id.split_once(':') {
        if let Some(providers) = root.get_mut("providers") {
            if let Some(prov_map) = providers.as_object_mut() {
                if let Some(prov_entry) = prov_map.get_mut(prov_name) {
                    if let Some(base) = prov_entry.as_object_mut() {
                        if let Some(b) = new_base_url { base.insert("base_url".to_string(), json!(b)); }
                    }
                    if let (Some(new_m), Some(old)) = (new_model, Some(old_model_id)) {
                        if new_m != old {
                            if let Some(models) = prov_entry.get_mut("models") {
                                if let Some(models_map) = models.as_object_mut() {
                                    if let Some(conf) = models_map.remove(old) {
                                        models_map.insert(new_m.to_string(), conf);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    write_yaml(app, profile, &root)?;
    Ok(json!({ "success": true }))
}
