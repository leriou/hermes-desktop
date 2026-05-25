use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelAlias {
    pub name: String,
    pub model: String,
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "contextLength")]
    pub context_length: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub mode: String,
    #[serde(rename = "remoteUrl")]
    pub remote_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub ssh: SshConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(rename = "keyPath")]
    pub key_path: String,
    #[serde(rename = "remotePort")]
    pub remote_port: u16,
    #[serde(rename = "localPort")]
    pub local_port: u16,
}

pub fn read_desktop_config(desktop_json_path: &Path) -> serde_json::Value {
    if !desktop_json_path.exists() {
        return serde_json::json!({});
    }
    match fs::read_to_string(desktop_json_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    }
}

pub fn get_connection_config(desktop_json_path: &Path) -> ConnectionConfig {
    let data = read_desktop_config(desktop_json_path);
    let ssh_data = data.get("sshConfig").cloned().unwrap_or_else(|| serde_json::json!({}));
    
    ConnectionConfig {
        mode: data.get("connectionMode").and_then(|v| v.as_str()).unwrap_or("local").to_string(),
        remote_url: data.get("remoteUrl").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        api_key: data.get("remoteApiKey").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        ssh: SshConfig {
            host: ssh_data.get("host").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            port: ssh_data.get("port").and_then(|v| v.as_u64()).unwrap_or(22) as u16,
            username: ssh_data.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            key_path: ssh_data.get("keyPath").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            remote_port: ssh_data.get("remotePort").and_then(|v| v.as_u64()).unwrap_or(8765) as u16,
            local_port: ssh_data.get("localPort").and_then(|v| v.as_u64()).unwrap_or(18765) as u16,
        }
    }
}

pub fn read_env(env_path: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Ok(content) = fs::read_to_string(env_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || !trimmed.contains('=') {
                continue;
            }
            if let Some((key, value)) = trimmed.split_once('=') {
                let key = key.trim().to_string();
                let mut val = value.trim().to_string();
                if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
                    val = val[1..val.len()-1].to_string();
                }
                map.insert(key, val);
            }
        }
    }
    map
}

pub fn set_env_value(env_path: &Path, key: &str, value: &str) -> std::io::Result<()> {
    let content = fs::read_to_string(env_path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut found = false;

    let search_pattern = format!("{}=", key);
    for line in lines.iter_mut() {
        let trimmed = line.trim();
        if trimmed.starts_with(key) && trimmed.starts_with(&search_pattern) {
            *line = format!("{}={}", key, value);
            found = true;
            break;
        }
    }

    if !found {
        lines.push(format!("{}={}", key, value));
    }

    fs::write(env_path, lines.join("\n") + "\n")
}

pub fn get_yaml_path(content: &str, dotted_key: &str) -> Option<String> {
    let parts: Vec<&str> = dotted_key.split('.').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() { return None; }

    let mut stack: Vec<(usize, &str)> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }

        let indent = line.len() - trimmed.len();
        while !stack.is_empty() && stack.last().unwrap().0 >= indent {
            stack.pop();
        }
        let path_idx = stack.len();

        if let Some(colon_idx) = trimmed.find(':') {
            let raw_key = trimmed[..colon_idx].trim();
            let key = strip_quotes(raw_key);
            let remainder = &trimmed[colon_idx + 1..];

            if path_idx < parts.len() && key == parts[path_idx] {
                if path_idx == parts.len() - 1 {
                    return parse_scalar(remainder);
                }
                stack.push((indent, key));
            }
        }
    }
    None
}

fn strip_quotes(s: &str) -> &str {
    if s.len() >= 2 {
        let first = s.chars().next().unwrap();
        let last = s.chars().last().unwrap();
        if (first == '"' || first == '\'') && first == last {
            return &s[1..s.len()-1];
        }
    }
    s
}

fn parse_scalar(remainder: &str) -> Option<String> {
    let value = remainder.trim_start();
    if value.is_empty() { return None; }

    let mut result = String::new();
    if value.starts_with('"') || value.starts_with('\'') {
        let quote = value.chars().next().unwrap();
        let mut chars = value.chars().skip(1);
        while let Some(c) = chars.next() {
            if c == quote { break; }
            result.push(c);
        }
    } else {
        if let Some(comment_idx) = value.find(" #") {
            result = value[..comment_idx].trim().to_string();
        } else {
            result = value.trim().to_string();
        }
    }
    if result.is_empty() { None } else { Some(result) }
}

pub fn set_yaml_value(content: &str, key: &str, value: &str) -> String {
    let segments: Vec<&str> = key.split('.').filter(|s| !s.is_empty()).collect();
    if segments.is_empty() { return content.to_string(); }

    if segments.len() == 1 {
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        let mut found = false;
        let prefix = format!("{}:", segments[0]);
        for line in lines.iter_mut() {
            if line.starts_with(&prefix) {
                *line = format!("{}: \"{}\"", segments[0], value);
                found = true;
                break;
            }
        }
        if !found {
            lines.push(format!("{}: \"{}\"", segments[0], value));
        }
        return lines.join("\n") + "\n";
    }

    if let Some(hit) = find_yaml_path_offsets(content, key) {
        let mut new_content = String::with_capacity(content.len() + value.len());
        new_content.push_str(&content[..hit.start]);
        new_content.push_str(&format!("\"{}\"", value));
        new_content.push_str(&content[hit.end..]);
        return new_content;
    }
    
    content.to_string()
}

struct YamlHit {
    start: usize,
    end: usize,
}

fn find_yaml_path_offsets(content: &str, dotted_path: &str) -> Option<YamlHit> {
    let segments: Vec<&str> = dotted_path.split('.').filter(|s| !s.is_empty()).collect();
    let mut cursor = 0;
    let mut parent_indent: i32 = -1;

    for (i, &segment) in segments.iter().enumerate() {
        let is_last = i == segments.len() - 1;
        if let Some(m) = find_segment_in_block(content, cursor, parent_indent, segment) {
            if is_last {
                return Some(YamlHit { start: m.value_start, end: m.value_end });
            }
            cursor = m.after_line;
            parent_indent = m.indent as i32;
        } else {
            return None;
        }
    }
    None
}

struct SegmentMatch {
    indent: usize,
    value_start: usize,
    value_end: usize,
    after_line: usize,
}

fn find_segment_in_block(content: &str, start_at: usize, parent_indent: i32, segment: &str) -> Option<SegmentMatch> {
    let mut cursor = start_at;
    let mut direct_child_indent: Option<usize> = None;

    while cursor < content.len() {
        let line_end = content[cursor..].find('\n').map(|i| cursor + i).unwrap_or(content.len());
        let line = &content[cursor..line_end];
        let trimmed = line.trim_start();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            cursor = if line_end == content.len() { content.len() } else { line_end + 1 };
            continue;
        }

        let indent = line.len() - trimmed.len();
        if indent as i32 <= parent_indent { return None; }

        if direct_child_indent.is_none() { direct_child_indent = Some(indent); }

        if Some(indent) == direct_child_indent {
            let colon_idx = trimmed.find(':');
            if let Some(c_idx) = colon_idx {
                let key = trimmed[..c_idx].trim();
                if key == segment {
                    let remainder = &trimmed[c_idx + 1..];
                    let gap = remainder.len() - remainder.trim_start().len();
                    let raw_value = remainder.trim_start();
                    let val_len = if let Some(comment_idx) = raw_value.find(" #") {
                        raw_value[..comment_idx].trim_end().len()
                    } else {
                        raw_value.len()
                    };

                    let value_start = cursor + indent + c_idx + 1 + gap;
                    return Some(SegmentMatch {
                        indent,
                        value_start,
                        value_end: value_start + val_len,
                        after_line: if line_end == content.len() { content.len() } else { line_end + 1 },
                    });
                }
            }
        }
        cursor = if line_end == content.len() { content.len() } else { line_end + 1 };
    }
    None
}

pub fn get_model_aliases(content: &str) -> Vec<ModelAlias> {
    let mut aliases = Vec::new();
    let mut in_aliases = false;
    let mut alias_indent = 0;
    let mut current_alias = String::new();
    let mut current_indent = 0;
    let mut current_data = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        let indent = line.len() - trimmed.len();

        if trimmed.starts_with("model_aliases:") {
            in_aliases = true;
            alias_indent = indent;
            continue;
        }

        if in_aliases && indent <= alias_indent && !trimmed.starts_with("model_aliases") {
            if !current_alias.is_empty() {
                aliases.push(build_alias(&current_alias, &current_data));
                current_alias.clear();
                current_data.clear();
            }
            in_aliases = false;
            continue;
        }

        if !in_aliases { continue; }

        if indent == alias_indent + 2 && trimmed.contains(':') {
            if !current_alias.is_empty() {
                aliases.push(build_alias(&current_alias, &current_data));
            }
            if let Some((name, _)) = trimmed.split_once(':') {
                current_alias = name.trim().to_string();
                current_indent = indent;
                current_data.clear();
            }
            continue;
        }

        if !current_alias.is_empty() && indent > current_indent && trimmed.contains(':') {
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_string();
                let mut val = v.trim();
                if let Some(comment_idx) = val.find(" #") {
                    val = val[..comment_idx].trim();
                }
                if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
                    val = &val[1..val.len()-1];
                }
                current_data.insert(key, val.to_string());
            }
        }
    }

    if !current_alias.is_empty() {
        aliases.push(build_alias(&current_alias, &current_data));
    }

    aliases
}

fn build_alias(name: &str, data: &std::collections::HashMap<String, String>) -> ModelAlias {
    ModelAlias {
        name: name.to_string(),
        model: data.get("model").cloned().unwrap_or_default(),
        provider: data.get("provider").cloned().unwrap_or_else(|| "custom".to_string()),
        base_url: data.get("base_url").cloned().unwrap_or_default(),
        context_length: data.get("context_length").and_then(|s| s.parse().ok()),
    }
}

pub fn parse_enabled_toolsets(content: &str) -> std::collections::HashSet<String> {
    let mut enabled = std::collections::HashSet::new();
    let mut in_platform_toolsets = false;
    let mut in_cli = false;

    for line in content.lines() {
        let trimmed = line.trim_end();

        // Detect section headers
        if trimmed.trim_start().starts_with("platform_toolsets:") {
            let indent = line.len() - line.trim_start().len();
            if indent == 0 {
                in_platform_toolsets = true;
                in_cli = false;
                continue;
            }
        }

        if in_platform_toolsets && trimmed.trim_start().starts_with("cli:") {
            let indent = line.len() - line.trim_start().len();
            if indent == 2 {
                in_cli = true;
                continue;
            }
        }

        // Exit sections on un-indent
        let indent = line.len() - line.trim_start().len();
        if in_platform_toolsets && indent == 0 && !trimmed.trim().is_empty() {
            in_platform_toolsets = false;
            in_cli = false;
            continue;
        }

        if in_cli && indent <= 2 && !trimmed.trim().is_empty() && !trimmed.trim_start().starts_with('-') {
            in_cli = false;
            continue;
        }

        // Parse list items inside cli:
        if in_cli && trimmed.trim_start().starts_with("- ") {
            let item = trimmed.trim_start()[2..].trim();
            let key = strip_quotes(item);
            enabled.insert(key.to_string());
        }
    }

    enabled
}

pub fn set_toolsets_enabled(content: &str, key: &str, enabled: bool) -> Option<String> {
    let mut current_enabled = parse_enabled_toolsets(content);
    if enabled {
        current_enabled.insert(key.to_string());
    } else {
        current_enabled.remove(key);
    }

    let mut sorted_keys: Vec<_> = current_enabled.into_iter().collect();
    sorted_keys.sort();

    let new_section = if sorted_keys.is_empty() {
        "  cli: []".to_string()
    } else {
        let items: Vec<String> = sorted_keys.iter().map(|k| format!("      - {}", k)).collect();
        format!("  cli:\n{}", items.join("\n"))
    };

    if content.contains("platform_toolsets:") {
        let lines: Vec<&str> = content.lines().collect();
        let mut result = Vec::new();
        let mut in_platform_toolsets = false;
        let mut in_cli = false;
        let mut cli_inserted = false;

        let mut i = 0;
        while i < lines.len() {
            let line = lines[i];
            let trimmed = line.trim_end();
            let indent = line.len() - line.trim_start().len();

            if trimmed.trim_start().starts_with("platform_toolsets:") && indent == 0 {
                in_platform_toolsets = true;
                result.push(line.to_string());
                i += 1;
                continue;
            }

            if in_platform_toolsets && trimmed.trim_start().starts_with("cli:") && indent == 2 {
                in_cli = true;
                result.push(new_section.clone());
                cli_inserted = true;
                i += 1;
                continue;
            }

            if in_cli {
                if trimmed.trim_start().starts_with("- ") && indent >= 4 {
                    i += 1;
                    continue;
                }
                if indent <= 2 || (!trimmed.trim().is_empty() && indent == 0) {
                    in_cli = false;
                    result.push(line.to_string());
                }
                i += 1;
                continue;
            }

            if in_platform_toolsets && indent == 0 && !trimmed.trim().is_empty() {
                in_platform_toolsets = false;
                if !cli_inserted {
                    result.push(new_section.clone());
                    cli_inserted = true;
                }
            }

            result.push(line.to_string());
            i += 1;
        }

        if in_platform_toolsets && !cli_inserted {
            result.push(new_section);
        }

        Some(result.join("\n") + "\n")
    } else {
        let new_content = format!("{}\n\nplatform_toolsets:\n{}\n", content.trim_end(), new_section);
        Some(new_content)
    }
}

pub fn list_mcp_servers(content: &str) -> Vec<serde_json::Value> {
    let mut servers = Vec::new();
    let mut in_mcp = false;
    let mut mcp_indent = 0;
    let mut current_server = String::new();
    let mut current_indent = 0;
    let mut current_data = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        let indent = line.len() - trimmed.len();

        if trimmed.starts_with("mcp_servers:") {
            in_mcp = true;
            mcp_indent = indent;
            continue;
        }

        if in_mcp && indent <= mcp_indent && !trimmed.starts_with("mcp_servers") {
            if !current_server.is_empty() {
                servers.push(build_mcp_item(&current_server, &current_data));
                current_server.clear();
                current_data.clear();
            }
            in_mcp = false;
            continue;
        }

        if !in_mcp { continue; }

        if indent == mcp_indent + 2 && trimmed.contains(':') {
            if !current_server.is_empty() {
                servers.push(build_mcp_item(&current_server, &current_data));
            }
            if let Some((name, _)) = trimmed.split_once(':') {
                current_server = name.trim().to_string();
                current_indent = indent;
                current_data.clear();
            }
            continue;
        }

        if !current_server.is_empty() && indent > current_indent && trimmed.contains(':') {
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_string();
                let mut val = v.trim();
                if let Some(comment_idx) = val.find(" #") {
                    val = val[..comment_idx].trim();
                }
                if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
                    val = &val[1..val.len()-1];
                }
                current_data.insert(key, val.to_string());
            }
        }
    }

    if !current_server.is_empty() {
        servers.push(build_mcp_item(&current_server, &current_data));
    }

    servers
}

fn build_mcp_item(name: &str, data: &std::collections::HashMap<String, String>) -> serde_json::Value {
    let has_url = data.contains_key("url");
    let enabled = data.get("enabled").map(|s| s.to_lowercase() == "true").unwrap_or(true);
    let detail = if has_url {
        data.get("url").cloned().unwrap_or_else(|| "HTTP".to_string())
    } else {
        data.get("command").cloned().unwrap_or_else(|| "stdio".to_string())
    };

    serde_json::json!({
        "name": name,
        "type": if has_url { "http" } else { "stdio" },
        "enabled": enabled,
        "detail": detail
    })
}

pub fn list_plugins(content: &str) -> Vec<serde_json::Value> {
    let mut plugins = Vec::new();
    let mut in_plugins = false;
    let mut plugin_indent = 0;
    let mut current_name = String::new();
    let mut current_data = std::collections::HashMap::new();
    let mut current_indent = 0;

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
        let indent = line.len() - trimmed.len();

        if trimmed.starts_with("plugins:") {
            in_plugins = true;
            plugin_indent = indent;
            continue;
        }

        if in_plugins && indent <= plugin_indent && !trimmed.starts_with("plugins") {
            if !current_name.is_empty() {
                plugins.push(build_plugin_item(&current_name, &current_data));
                current_name.clear();
                current_data.clear();
            }
            in_plugins = false;
            continue;
        }

        if !in_plugins { continue; }

        if indent == plugin_indent + 2 && trimmed.contains(':') {
            if !current_name.is_empty() {
                plugins.push(build_plugin_item(&current_name, &current_data));
            }
            if let Some((name, _)) = trimmed.split_once(':') {
                current_name = name.trim().to_string();
                current_indent = indent;
                current_data.clear();
            }
            continue;
        }

        if !current_name.is_empty() && indent > current_indent && trimmed.contains(':') {
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_string();
                let mut val = v.trim();
                if let Some(comment_idx) = val.find(" #") {
                    val = val[..comment_idx].trim();
                }
                if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
                    val = &val[1..val.len()-1];
                }
                current_data.insert(key, val.to_string());
            }
        }
    }

    if !current_name.is_empty() {
        plugins.push(build_plugin_item(&current_name, &current_data));
    }
    plugins
}

pub fn set_plugin_state(content: &str, name: &str, enabled: bool) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    let mut result: Vec<String> = Vec::new();
    let mut in_plugins = false;
    let mut plugin_indent = 0;
    let mut found = false;

    for line in &lines {
        let trimmed = line.trim_start();
        if trimmed.starts_with("plugins:") {
            in_plugins = true;
            plugin_indent = line.len() - trimmed.len();
            result.push(line.to_string());
            continue;
        }

        if in_plugins {
            let indent = line.len() - trimmed.len();
            if indent <= plugin_indent && !trimmed.starts_with("plugins") {
                in_plugins = false;
                result.push(line.to_string());
                continue;
            }
            if indent == plugin_indent + 2 && trimmed.contains(':') {
                if let Some((plugin_name, _)) = trimmed.split_once(':') {
                    if plugin_name.trim() == name {
                        found = true;
                    }
                }
            }
            if found && trimmed.starts_with("enabled:") {
                let new_val = if enabled { "true" } else { "false" };
                let prefix: String = line.chars().take_while(|c| c.is_whitespace()).collect();
                result.push(format!("{}enabled: {}", prefix, new_val));
                found = false;
                continue;
            }
        }
        result.push(line.to_string());
    }

    if result.iter().any(|l| l.contains("enabled:")) {
        Some(result.join("\n"))
    } else {
        None
    }
}

fn build_plugin_item(name: &str, data: &std::collections::HashMap<String, String>) -> serde_json::Value {
    let enabled_str = data.get("enabled").map(|s| s.as_str()).unwrap_or("true");
    let enabled = enabled_str == "true" || enabled_str == "yes";
    serde_json::json!({
        "name": name,
        "enabled": enabled,
        "version": data.get("version").unwrap_or(&String::new()),
        "description": data.get("description").unwrap_or(&String::new()),
        "source": data.get("source").unwrap_or(&String::new()),
    })
}
