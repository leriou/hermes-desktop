use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};
use tauri::{AppHandle, Emitter, Listener, Runtime};
use std::sync::{Arc, Mutex as StdMutex};
use crate::python;
use std::time::Duration;
use tokio::time::timeout;

struct SendWrapper<T>(T);
unsafe impl<T> Send for SendWrapper<T> {}

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

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum GatewayStatus {
    Stopped,
    Starting,
    Ready,
    Reconnecting,
    Failed,
}

fn log_info(component: &str, action: &str, msg: &str) {
    eprintln!("[{}] {} | INFO | {}", component.to_uppercase(), action.to_uppercase(), msg);
}

fn log_error(component: &str, action: &str, msg: &str) {
    eprintln!("[{}] {} | ERROR | {}", component.to_uppercase(), action.to_uppercase(), msg);
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GatewayFailure {
    pub timestamp: u64,
    pub error: String,
    pub status_at_failure: GatewayStatus,
}

pub struct TuiGateway<R: Runtime = tauri::Wry> {
    app: AppHandle<R>,
    profile: Option<String>,
    pub(crate) inner: Arc<TokioMutex<TuiGatewayInner>>,
    pending_requests: Arc<StdMutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value>>>>>,
    session_aliases: Arc<StdMutex<HashMap<String, String>>>,
    next_id: StdMutex<u64>,
}

pub(crate) struct TuiGatewayInner {
    pub(crate) status: GatewayStatus,
    pub(crate) stdin_tx: Option<mpsc::Sender<String>>,
    pub(crate) stop_tx: Option<oneshot::Sender<()>>,
    pub(crate) restart_count: u32,
    pub(crate) max_restarts: u32,
    pub(crate) active_session_id: Option<String>,
    pub(crate) last_error: Option<String>,
    pub(crate) last_ready_at: Option<u64>,
    pub(crate) failures: Vec<GatewayFailure>,
}

impl<R: Runtime> TuiGateway<R> {
    pub fn new(app: AppHandle<R>, profile: Option<String>) -> Self {
        Self {
            app,
            profile,
            inner: Arc::new(TokioMutex::new(TuiGatewayInner {
                status: GatewayStatus::Stopped,
                stdin_tx: None,
                stop_tx: None,
                restart_count: 0,
                max_restarts: 5,
                active_session_id: None,
                last_error: None,
                last_ready_at: None,
                failures: Vec::with_capacity(10),
            })),
            pending_requests: Arc::new(StdMutex::new(HashMap::new())),
            session_aliases: Arc::new(StdMutex::new(HashMap::new())),
            next_id: StdMutex::new(1),
        }
    }

    pub async fn record_failure(&self, error: String, status: GatewayStatus) {
        let mut inner = self.inner.lock().await;
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        inner.last_error = Some(error.clone());
        if inner.failures.len() >= 10 {
            inner.failures.remove(0);
        }
        inner.failures.push(GatewayFailure {
            timestamp,
            error,
            status_at_failure: status,
        });

        // Quietly persist to a diagnostic file
        let home = python::get_hermes_home(Some(&self.app));
        let diag_file = home.join("logs").join("gateway_failures.json");
        if let Ok(json) = serde_json::to_string(&inner.failures) {
            let _ = std::fs::create_dir_all(diag_file.parent().unwrap());
            let _ = std::fs::write(diag_file, json);
        }
    }

    pub async fn get_health(&self) -> serde_json::Value {
        let inner = self.inner.lock().await;
        let python_path = python::get_python_path(Some(&self.app));
        let repo_path = python::get_hermes_repo(Some(&self.app));
        let hermes_home = python::get_hermes_home_with_profile(Some(&self.app), self.profile.clone());

        let pending_count = self.pending_requests.lock().unwrap().len();

        serde_json::json!({
            "status": inner.status,
            "restartCount": inner.restart_count,
            "maxRestarts": inner.max_restarts,
            "activeSessionId": inner.active_session_id,
            "lastError": inner.last_error,
            "lastReadyAt": inner.last_ready_at,
            "pendingRequests": pending_count,
            "failures": inner.failures,
            "paths": {
                "python": python_path.to_string_lossy(),
                "pythonExists": python_path.exists(),
                "repo": repo_path.to_string_lossy(),
                "repoExists": repo_path.exists(),
                "home": hermes_home.to_string_lossy(),
                "homeExists": hermes_home.exists(),
            }
        })
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

    pub fn set_active_session(&self, session_id: String) {
        if let Ok(mut inner) = self.inner.try_lock() {
            inner.active_session_id = Some(session_id);
        }
    }

    pub async fn start(self: Arc<Self>) -> Result<()> {
        {
            let mut inner = self.inner.lock().await;
            if inner.status == GatewayStatus::Ready || inner.status == GatewayStatus::Starting {
                return Ok(());
            }
            inner.status = GatewayStatus::Starting;
            inner.last_error = None;
        }

        if let Err(e) = self.clone().spawn_process().await {
            let s = { self.inner.lock().await.status };
            self.record_failure(e.to_string(), s).await;
            let mut inner = self.inner.lock().await;
            inner.status = GatewayStatus::Failed;
            return Err(e);
        }

        let (tx, rx) = oneshot::channel();
        let tx_arc = Arc::new(StdMutex::new(Some(tx)));
        let ready_handler_id = SendWrapper(self.app.listen("tui-event", move |event| {
            if let Ok(params) = serde_json::from_str::<EventParams>(event.payload()) {
                if params.event_type == "gateway.ready" {
                    if let Some(tx) = tx_arc.lock().unwrap().take() {
                        let _ = tx.send(());
                    }
                }
            }
        }));

        let res = timeout(Duration::from_secs(60), rx).await;
        self.app.unlisten(ready_handler_id.0);

        match res {
            Ok(Ok(())) => {
                log_info("gateway", "ready", "Gateway.ready received, startup complete");
                let mut inner = self.inner.lock().await;
                inner.status = GatewayStatus::Ready;
                inner.restart_count = 0;
                inner.last_ready_at = Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());
                Ok(())
            }
            _ => {
                log_error("gateway", "start", "TIMEOUT waiting for gateway.ready (60s)");
                self.stop().await;
                self.record_failure("Startup timeout".to_string(), GatewayStatus::Starting).await;
                let mut inner = self.inner.lock().await;
                inner.status = GatewayStatus::Failed;
                Err(anyhow!("Gateway timeout or failed to start"))
            }
        }
    }

    async fn spawn_process(self: Arc<Self>) -> Result<()> {
        let python_path = python::get_python_path(Some(&self.app));
        let repo_path = python::get_hermes_repo(Some(&self.app));
        let hermes_home = python::get_hermes_home_with_profile(Some(&self.app), self.profile.clone());

        log_info("gateway", "spawn", &format!("Spawning: {:?} -m tui_gateway.entry", python_path));
        log_info("gateway", "spawn", &format!("CWD: {:?}", repo_path));
        log_info("gateway", "spawn", &format!("HERMES_HOME: {:?}", hermes_home));

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
                log_error("gateway", "spawn", &format!("spawn failed: {}", e));
                e
            })?;

        log_info("gateway", "spawn", &format!("Process spawned, PID: {:?}", child.id()));

        let stdin = child.stdin.take().ok_or_else(|| anyhow!("Failed to open stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("Failed to open stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("Failed to open stderr"))?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(32);
        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();

        {
            let mut inner = self.inner.lock().await;
            inner.stdin_tx = Some(stdin_tx);
            inner.stop_tx = Some(stop_tx);
        }

        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(line) = stdin_rx.recv().await {
                if stdin.write_all(format!("{}\n", line).as_bytes()).await.is_err() { break; }
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
                } else {
                    let truncated: String = line.chars().take(200).collect();
                    log_info("gateway", "stdout", &truncated);
                }
            }
        });

        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let truncated: String = line.chars().take(200).collect();
                log_error("gateway", "stderr", &truncated);
            }
        });

        // Monitor process exit for auto-reconnection
        let self_clone = self.clone();
        tokio::spawn(async move {
            tokio::select! {
                res = child.wait() => {
                    match res {
                        Ok(status) => log_info("gateway", "exit", &format!("Process exited with status: {}", status)),
                        Err(e) => log_error("gateway", "exit", &format!("Error waiting for process: {}", e)),
                    }
                    TuiGateway::handle_exit(self_clone);
                }
                _ = &mut stop_rx => {
                    log_info("gateway", "stop", "Stop signal received, terminating process");
                    let _ = child.kill().await;
                }
            }
        });

        // Proactive watchdog for startup timeout
        let watchdog_gw = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(65)).await;
            let status = { watchdog_gw.inner.lock().await.status };
            if status == GatewayStatus::Starting || status == GatewayStatus::Reconnecting {
                log_error("gateway", "watchdog", "STALE state detected after 15s, forcing failure");
                watchdog_gw.record_failure("Watchdog: Startup/Reconnect timeout".to_string(), status).await;
                let mut inner = watchdog_gw.inner.lock().await;
                inner.status = GatewayStatus::Failed;
                // No need to call stop() as it's already failed/not-ready
            }
        });

        Ok(())
    }

    pub fn handle_exit(gateway: Arc<Self>) {
        tokio::spawn(async move {
            let (status, restart_count, max_restarts, active_session) = {
                let mut inner = gateway.inner.lock().await;
                let s = inner.status;
                inner.stdin_tx = None;
                inner.stop_tx = None;
                (s, inner.restart_count, inner.max_restarts, inner.active_session_id.clone())
            };

            if status == GatewayStatus::Stopped {
                log_info("gateway", "exit", "Gateway stopped intentionally, no reconnection.");
                return;
            }

            if restart_count >= max_restarts {
                log_error("gateway", "reconnect", &format!("Max restarts reached ({}), stopping reconnection.", max_restarts));
                gateway.record_failure("Max restarts reached".to_string(), status).await;
                {
                    let mut inner = gateway.inner.lock().await;
                    inner.status = GatewayStatus::Failed;
                }
                let _ = gateway.app.emit("tui-event", EventParams {
                    event_type: "gateway.connection_lost".to_string(),
                    session_id: None,
                    payload: serde_json::json!({ "error": "Max restarts reached" }),
                });
                return;
            }

            {
                let mut inner = gateway.inner.lock().await;
                inner.status = GatewayStatus::Reconnecting;
                inner.restart_count += 1;
            }

            let _ = gateway.app.emit("tui-event", EventParams {
                event_type: "gateway.reconnecting".to_string(),
                session_id: None,
                payload: serde_json::json!({ "attempt": restart_count + 1 }),
            });

            let delay = Duration::from_secs(2u64.pow(restart_count));
            log_info("gateway", "reconnect", &format!("Unexpected exit, reconnecting in {:?}", delay));
            tokio::time::sleep(delay).await;

            if let Err(e) = gateway.clone().spawn_process().await {
                log_error("gateway", "reconnect", &format!("Reconnect spawn failed: {}", e));
                gateway.record_failure(format!("Reconnect spawn failed: {}", e), GatewayStatus::Reconnecting).await;
                TuiGateway::handle_exit(gateway.clone());
                return;
            }

            let (tx, rx) = oneshot::channel();
            let tx_arc = Arc::new(StdMutex::new(Some(tx)));
            let ready_handler_id = SendWrapper(gateway.app.listen("tui-event", move |event| {
                if let Ok(params) = serde_json::from_str::<EventParams>(event.payload()) {
                    if params.event_type == "gateway.ready" {
                        if let Some(tx) = tx_arc.lock().unwrap().take() {
                            let _ = tx.send(());
                        }
                    }
                }
            }));

            let res = timeout(Duration::from_secs(60), rx).await;
            gateway.app.unlisten(ready_handler_id.0);

            match res {
                Ok(Ok(())) => {
                    log_info("gateway", "reconnect", "Reconnected successfully");
                    {
                        let mut inner = gateway.inner.lock().await;
                        inner.status = GatewayStatus::Ready;
                        inner.restart_count = 0;
                        inner.last_ready_at = Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());
                    }
                    if let Some(sid) = active_session {
                        log_info("gateway", "resume", &format!("Auto-resuming session: {}", sid));
                        let gateway_c = gateway.clone();
                        tokio::spawn(async move {
                            if let Err(e) = gateway_c.call("session.resume", serde_json::json!({ "session_id": sid })).await {
                                  log_error("gateway", "resume", &format!("Auto-resume failed: {}", e));
                            } else {
                                  log_info("gateway", "resume", "Auto-resume complete");
                                  let _ = gateway_c.app.emit("tui-event", EventParams {
                                      event_type: "gateway.reconnected".to_string(),
                                      session_id: Some(sid),
                                      payload: serde_json::json!({ "success": true }),
                                  });
                            }
                        });
                    }
                }
                _ => {
                    log_error("gateway", "reconnect", "Reconnect timeout, retrying...");
                    gateway.record_failure("Reconnect timeout".to_string(), GatewayStatus::Reconnecting).await;
                    TuiGateway::handle_exit(gateway.clone());
                }
            }
        });
    }

    pub async fn stop(&self) {
        let mut inner = self.inner.lock().await;
        inner.status = GatewayStatus::Stopped;
        if let Some(stop_tx) = inner.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        inner.stdin_tx = None;

        // Fail all pending requests
        let mut pending = self.pending_requests.lock().unwrap();
        for (_, tx) in pending.drain() {
            let _ = tx.send(Err(anyhow!("Gateway stopped")));
        }
    }

    pub async fn call(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let (stdin_tx, status) = {
            let inner = self.inner.lock().await;
            (inner.stdin_tx.clone(), inner.status)
        };

        if status != GatewayStatus::Ready {
            return Err(anyhow!("Gateway not ready (current status: {:?})", status));
        }

        let stdin_tx = stdin_tx.ok_or_else(|| anyhow!("Gateway stdin channel missing"))?;

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
        if let Err(_) = stdin_tx.send(json).await {
            let mut pending = self.pending_requests.lock().unwrap();
            pending.remove(&id);
            return Err(anyhow!("Gateway stdin channel closed"));
        }

        match timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err(anyhow!("Gateway response channel closed")),
            Err(_) => {
                let mut pending = self.pending_requests.lock().unwrap();
                pending.remove(&id);
                log_error("gateway", "rpc", &format!("Timeout waiting for response to {}(id={})", method, id));
                Err(anyhow!("Gateway RPC timeout (30s)"))
            }
        }
    }

    pub async fn is_running(&self) -> bool {
        let inner = self.inner.lock().await;
        inner.status == GatewayStatus::Ready
    }

    pub async fn is_busy(&self) -> bool {
        let inner = self.inner.lock().await;
        inner.status == GatewayStatus::Ready || inner.status == GatewayStatus::Starting
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gateway_status_serialization() {
        let status = GatewayStatus::Ready;
        let json = serde_json::to_value(status).unwrap();
        assert_eq!(json, serde_json::json!("Ready"));
    }

    #[tokio::test]
    async fn test_restart_backoff_calculation() {
        let restart_count = 3;
        let delay = Duration::from_secs(2u64.pow(restart_count));
        assert_eq!(delay, Duration::from_secs(8));
    }

    #[test]
    fn test_error_classification() {
        // This is a logic test for how we want to classify errors in the caller
        let timeout_err = anyhow!("Gateway RPC timeout (30s)");
        assert!(timeout_err.to_string().contains("timeout"));

        let not_running_err = anyhow!("Gateway not ready (current status: Stopped)");
        assert!(not_running_err.to_string().contains("not ready"));
    }

    #[tokio::test]
    async fn test_pending_request_cleanup_on_stop() {
        let app = tauri::test::mock_app();
        let gateway = Arc::new(TuiGateway::new(app.handle().clone(), None));

        // Mock a pending request
        let (tx, rx) = oneshot::channel();
        gateway.pending_requests.lock().unwrap().insert(123, tx);

        // Stop the gateway
        gateway.stop().await;

        // Verify request was failed
        let res = rx.await;
        assert!(res.is_ok()); // The oneshot itself succeeded
        assert!(res.unwrap().is_err()); // But it sent an error

        assert_eq!(gateway.pending_requests.lock().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_gateway_busy_states() {
        let app = tauri::test::mock_app();
        let gateway = TuiGateway::new(app.handle().clone(), None);

        {
            let mut inner = gateway.inner.lock().await;
            inner.status = GatewayStatus::Starting;
        }
        assert!(gateway.is_busy().await);

        {
            let mut inner = gateway.inner.lock().await;
            inner.status = GatewayStatus::Ready;
        }
        assert!(gateway.is_busy().await);
        assert!(gateway.is_running().await);

        {
            let mut inner = gateway.inner.lock().await;
            inner.status = GatewayStatus::Stopped;
        }
        assert!(!gateway.is_busy().await);
        assert!(!gateway.is_running().await);
    }
}
