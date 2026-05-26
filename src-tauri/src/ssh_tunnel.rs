use tokio::process::{Child, Command};
use std::process::Stdio;
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

pub struct SshTunnelManager {
    child: Arc<Mutex<Option<Child>>>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self, args: Vec<String>) -> Result<()> {
        self.stop().await;
        
        let child = Command::new("ssh")
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
            
        let mut guard = self.child.lock().await;
        *guard = Some(child);
        Ok(())
    }

    pub async fn stop(&self) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }
    }

    pub async fn is_active(&self) -> bool {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            // Check if process is still running
            match child.try_wait() {
                Ok(None) => true,
                _ => {
                    *guard = None;
                    false
                }
            }
        } else {
            false
        }
    }
}
