use std::fs;
use serde_json::{json, Value};
use crate::python;
use tauri::AppHandle;

/// Parse YAML frontmatter from SKILL.md for name and description.
fn parse_skill_frontmatter(content: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();

    if !content.starts_with("---") {
        // Fallback: try first heading
        for line in content.lines() {
            if let Some(heading) = line.strip_prefix("# ") {
                name = heading.trim().to_string();
                break;
            }
        }
        return (name, description);
    }

    // Find closing ---
    if let Some(end_idx) = content[3..].find("---") {
        let frontmatter = &content[3..end_idx + 3];
        for line in frontmatter.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("name:") {
                let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                if !val.is_empty() { name = val; }
            } else if let Some(rest) = trimmed.strip_prefix("description:") {
                let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                if !val.is_empty() { description = val; }
            }
        }
    }

    (name, description)
}

/// List installed skills from ~/.hermes/skills/<category>/<skill>/SKILL.md
pub fn list_installed_skills(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let home = python::get_hermes_home_with_profile(app, profile);
    let skills_dir = home.join("skills");
    eprintln!("[skills:installed] Looking at {:?}", skills_dir);

    if !skills_dir.exists() {
        eprintln!("[skills:installed] Directory does not exist");
        return Ok(json!([]));
    }

    let mut skills = Vec::new();
    if let Ok(categories) = fs::read_dir(&skills_dir) {
        for cat_entry in categories.flatten() {
            let cat_path = cat_entry.path();
            if !cat_path.is_dir() { continue; }
            let category = cat_entry.file_name().to_string_lossy().to_string();

            if let Ok(entries) = fs::read_dir(&cat_path) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if !entry_path.is_dir() { continue; }

                    let skill_md = entry_path.join("SKILL.md");
                    if !skill_md.exists() { continue; }

                    let entry_name = entry.file_name().to_string_lossy().to_string();

                    let (meta_name, meta_desc) = if let Ok(content) = fs::read_to_string(&skill_md) {
                        let truncated: String = content.chars().take(4000).collect();
                        parse_skill_frontmatter(&truncated)
                    } else {
                        (String::new(), String::new())
                    };

                    skills.push(json!({
                        "name": if meta_name.is_empty() { entry_name.clone() } else { meta_name },
                        "category": category,
                        "description": meta_desc,
                        "path": entry_path.to_string_lossy()
                    }));
                }
            }
        }
    }

    skills.sort_by(|a, b| {
        let cat_a = a.get("category").and_then(|v| v.as_str()).unwrap_or("");
        let cat_b = b.get("category").and_then(|v| v.as_str()).unwrap_or("");
        match cat_a.cmp(cat_b) {
            std::cmp::Ordering::Equal => {
                let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                name_a.cmp(name_b)
            }
            other => other,
        }
    });

    eprintln!("[skills:installed] Found {} skills", skills.len());
    Ok(json!(skills))
}

/// List bundled skills from ~/.hermes/hermes-agent/skills/<category>/<skill>/SKILL.md
pub fn list_bundled_skills(app: Option<&AppHandle>, profile: Option<String>) -> Result<Value, String> {
    let repo = python::get_hermes_repo(app);
    let skills_dir = repo.join("skills");
    eprintln!("[skills:bundled] Looking at {:?}", skills_dir);

    if !skills_dir.exists() {
        eprintln!("[skills:bundled] Directory does not exist");
        return Ok(json!([]));
    }

    // Build installed set for marking bundled skills as installed
    let home = python::get_hermes_home_with_profile(app, profile);
    let installed_dir = home.join("skills");
    let installed_set: std::collections::HashSet<String> = if installed_dir.exists() {
        let mut set = std::collections::HashSet::new();
        if let Ok(categories) = fs::read_dir(&installed_dir) {
            for cat_entry in categories.flatten() {
                let cat_path = cat_entry.path();
                if !cat_path.is_dir() { continue; }
                if let Ok(entries) = fs::read_dir(&cat_path) {
                    for entry in entries.flatten() {
                        if entry.path().is_dir() {
                            if let Some(name) = entry.file_name().to_str() {
                                set.insert(name.to_string());
                            }
                        }
                    }
                }
            }
        }
        set
    } else {
        std::collections::HashSet::new()
    };

    let mut skills = Vec::new();
    if let Ok(categories) = fs::read_dir(&skills_dir) {
        for cat_entry in categories.flatten() {
            let cat_path = cat_entry.path();
            if !cat_path.is_dir() { continue; }
            let category = cat_entry.file_name().to_string_lossy().to_string();
            if category == "index-cache" || category == "__pycache__" { continue; }

            if let Ok(entries) = fs::read_dir(&cat_path) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if !entry_path.is_dir() { continue; }

                    let skill_md = entry_path.join("SKILL.md");
                    if !skill_md.exists() { continue; }

                    let entry_name = entry.file_name().to_string_lossy().to_string();

                    let (meta_name, meta_desc) = if let Ok(content) = fs::read_to_string(&skill_md) {
                        let truncated: String = content.chars().take(4000).collect();
                        parse_skill_frontmatter(&truncated)
                    } else {
                        (String::new(), String::new())
                    };

                    let is_installed = installed_set.contains(&entry_name);

                    skills.push(json!({
                        "name": if meta_name.is_empty() { entry_name.clone() } else { meta_name },
                        "description": meta_desc,
                        "category": category,
                        "path": entry_path.to_string_lossy(),
                        "source": "bundled",
                        "installed": is_installed
                    }));
                }
            }
        }
    }

    skills.sort_by(|a, b| {
        let cat_a = a.get("category").and_then(|v| v.as_str()).unwrap_or("");
        let cat_b = b.get("category").and_then(|v| v.as_str()).unwrap_or("");
        match cat_a.cmp(cat_b) {
            std::cmp::Ordering::Equal => {
                let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                name_a.cmp(name_b)
            }
            other => other,
        }
    });

    eprintln!("[skills:bundled] Found {} bundled skills", skills.len());
    Ok(json!(skills))
}
