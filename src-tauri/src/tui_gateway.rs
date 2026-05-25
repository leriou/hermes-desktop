use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};
use tauri::{AppHandle, Emitter, Manager, Listener};
use std::sync::{Arc, Mutex as StdMutex};
use crate::python;
use std::time::Duration;
use tokio::time::timeout;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
    pub id: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: EventParams,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventParams {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "sid", alias = "session_id")]
    pub session_id: Option<String>,
    pub payload: serde_json::Value,
}

pub struct TuiGateway {
    app: AppHandle,
    profile: Option<String>,
    inner: Arc<TokioMutex<TuiGatewayInner>>,
    pending_requests: Arc<StdMutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value>>>>>,
    session_aliases: Arc<StdMutex<HashMap<String, String>>>,
    next_id: StdMutex<u64>,
}

struct TuiGatewayInner {
    child: Option<Child>,
    stdin_tx: Option<mpsc::Sender<String>>,
    restart_count: u32,
    max_restarts: u32,
    is_stopping: bool,
}

impl TuiGateway {
    pub fn new(app: AppHandle, profile: Option<String>) -> Self {
        Self {
            app,
            profile,
            inner: Arc::new(TokioMutex::new(TuiGatewayInner {
                child: None,
                stdin_tx: None,
                restart_count: 0,
                max_restarts: 5,
                is_stopping: false,
            })),
            pending_requests: Arc::new(StdMutex::new(HashMap::new())),
            session_aliases: Arc::new(StdMutex::new(HashMap::new())),
            next_id: StdMutex::new(1),
        }
    }

    pub fn bind_session_alias(&self, runtime_sid: &str, persist_sid: &str) {
        if runtime_sid.is_empty() || persist_sid.is_empty() || runtime_sid == persist_sid {
            return;
        }
        self.session_aliases
            .lock()
            .unwrap()
            .insert(runtime_sid.to_string(), persist_sid.to_string());
    }

    pub async fn start(self: Arc<Self>) -> Result<()> {
        {
            let inner = self.inner.lock().await;
            if inner.child.is_some() {
                return Ok(());
            }
        }

        self.spawn_process().await?;

        let (tx, rx) = oneshot::channel();
        let tx_arc = Arc::new(StdMutex::new(Some(tx)));
        let ready_handler_id = self.app.listen("tui-event", move |event| {
            if let Ok(params) = serde_json::from_str::<EventParams>(event.payload()) {
                if params.event_type == "gateway.ready" {
                    if let Some(tx) = tx_arc.lock().unwrap().take() {
                        let _ = tx.send(());
                    }
                }
            }
        });

        let res = timeout(Duration::from_secs(10), rx).await;
        self.app.unlisten(ready_handler_id);

        match res {
            Ok(Ok(())) => {
                eprintln!("[TUI GATEWAY] gateway.ready received, startup complete");
                let mut inner = self.inner.lock().await;
                inner.restart_count = 0;
                Ok(())
            }
            _ => {
                eprintln!("[TUI GATEWAY] TIMEOUT waiting for gateway.ready (10s)");
                self.stop().await;
                Err(anyhow!("Gateway timeout or failed to start"))
            }
        }
    }

    async fn spawn_process(&self) -> Result<()> {
        let python_path = python::get_python_path(Some(&self.app));
        let repo_path = python::get_hermes_repo(Some(&self.app));
        let hermes_home = python::get_hermes_home_with_profile(Some(&self.app), self.profile.clone());

        eprintln!("[TUI GATEWAY] Spawning: {:?} -m tui_gateway.entry", python_path);
        eprintln!("[TUI GATEWAY] CWD: {:?}", repo_path);
        eprintln!("[TUI GATEWAY] HERMES_HOME: {:?}", hermes_home);
        eprintln!("[TUI GATEWAY] Python exists: {}", python_path.exists());

        let mut args = vec!["-m", "tui_gateway.entry"];
        let p_str: String;
        if let Some(ref p) = self.profile {
            if p != "default" && !p.is_empty() {
                p_str = p.clone();
                args.push("-p");
                args.push(&p_str);
            }
        }

        let mut child = Command::new(python_path)
            .args(&args)
            .current_dir(repo_path)
            .env("HERMES_HOME", hermes_home)
            .env("PYTHONUNBUFFERED", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                eprintln!("[TUI GATEWAY] spawn failed: {}", e);
                e
            })?;

        eprintln!("[TUI GATEWAY] Process spawned, PID: {:?}", child.id());

        let stdin = child.stdin.take().ok_or_else(|| anyhow!("Failed to open stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("Failed to open stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("Failed to open stderr"))?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(32);
        
        {
            let mut inner = self.inner.lock().await;
            inner.stdin_tx = Some(stdin_tx);
            inner.child = Some(child);
        }

        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(line) = stdin_rx.recv().await {
                if let Err(_) = stdin.write_all(format!("{}\n", line).as_bytes()).await { break; }
                let _ = stdin.flush().await;
            }
        });

        let pending_requests = self.pending_requests.clone();
        let session_aliases = self.session_aliases.clone();
        let app_handle = self.app.clone();
        let profile = self.profile.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let truncated: String = line.chars().take(200).collect();
                eprintln!("[TUI GATEWAY STDOUT] {}", truncated);
                if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&line) {
                    if let Some(id) = response.id {
                        let mut pending = pending_requests.lock().unwrap();
                        if let Some(tx) = pending.remove(&id) {
                            if let Some(err) = response.error {
                                let _ = tx.send(Err(anyhow!("RPC Error {}: {}", err.code, err.message)));
                            } else {
                                let _ = tx.send(Ok(response.result.unwrap_or(serde_json::Value::Null)));
                            }
                        }
                    }
                } else if let Ok(notification) = serde_json::from_str::<JsonRpcNotification>(&line) {
                    if let Some(ref sid) = notification.params.session_id {
                        let evt_type = &notification.params.event_type;
                        let payload = &notification.params.payload;
                        let persist_sid = session_aliases
                            .lock()
                            .unwrap()
                            .get(sid)
                            .cloned()
                            .unwrap_or_else(|| sid.clone());
                        
                        if evt_type == "message.complete" {
                            if let Some(text) = payload.get("text").and_then(|v| v.as_str()) {
                                crate::session_utils::persist_message(Some(&app_handle), &persist_sid, "assistant", text, None, None, profile.clone());
                            }
                        } else if evt_type == "tool.start" {
                            if let Some(tool_id) = payload.get("tool_id").and_then(|v| v.as_str()) {
                                let name = payload.get("name").and_then(|v| v.as_str());
                                let args = payload.get("args_text").or_else(|| payload.get("args")).and_then(|v| v.as_str()).unwrap_or("");
                                crate::session_utils::persist_message(Some(&app_handle), &persist_sid, "tool_call", args, Some(tool_id), name, profile.clone());
                            }
                        } else if evt_type == "tool.complete" {
                            if let Some(tool_id) = payload.get("tool_id").and_then(|v| v.as_str()) {
                                let name = payload.get("name").and_then(|v| v.as_str());
                                let result_value = payload
                                    .get("result_text")
                                    .or_else(|| payload.get("result"))
                                    .or_else(|| payload.get("summary"));
                                let result = match result_value {
                                    Some(serde_json::Value::String(s)) => s.clone(),
                                    Some(v) => v.to_string(),
                                    None => String::new(),
                                };
                                crate::session_utils::persist_message(Some(&app_handle), &persist_sid, "tool", &result, Some(tool_id), name, profile.clone());
                            }
                        }
                    }
                    let _ = app_handle.emit("tui-event", &notification.params);
                }
            }
        });

        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let truncated: String = line.chars().take(200).collect();
                eprintln!("[TUI GATEWAY STDERR] {}", truncated);
            }
        });

        Ok(())
    }

    pub async fn stop(&self) {
        let mut inner = self.inner.lock().await;
        inner.is_stopping = true;
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill().await;
        }
    }

    pub async fn call(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let stdin_tx = {
            let inner = self.inner.lock().await;
            inner.stdin_tx.clone().ok_or_else(|| anyhow!("Gateway not running"))?
        };

        let id = {
            let mut id_gen = self.next_id.lock().unwrap();
            let id = *id_gen;
            *id_gen += 1;
            id
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: Some(id),
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().unwrap();
            pending.insert(id, tx);
        }

        let json = serde_json::to_string(&request)?;
        stdin_tx.send(json).await.map_err(|_| anyhow!("Gateway stdin channel closed"))?;

        rx.await.map_err(|_| anyhow!("Gateway response channel closed"))?
    }

    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.child.is_some()
    }
}
