fn main() {
  // Build-time metadata
  println!("cargo:rustc-env=BUILD_TIME={}", chrono_now());
  println!("cargo:rustc-env=GIT_COMMIT={}", git_commit());

  tauri_build::build()
}

fn chrono_now() -> String {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(|_| "unknown".into())
}

fn git_commit() -> String {
  std::process::Command::new("git")
    .args(["rev-parse", "--short", "HEAD"])
    .output()
    .ok()
    .and_then(|o| {
      if o.status.success() {
        String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
      } else {
        None
      }
    })
    .unwrap_or_else(|| "unknown".into())
}
