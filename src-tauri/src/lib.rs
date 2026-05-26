mod python;
mod commands;
mod tui_gateway;
mod profiles;
mod memory;
mod session_utils;
mod skill_utils;
mod config_utils;
mod ssh_tunnel;
mod cron_utils;
mod soul_utils;
mod model_utils;
mod menu;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Emitter;
use tui_gateway::TuiGateway;
use ssh_tunnel::SshTunnelManager;

pub struct AppState {
    pub gateway: Mutex<Option<Arc<TuiGateway>>>,
    pub ssh_tunnel: SshTunnelManager,
}

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .manage(AppState {
        gateway: Mutex::new(None),
        ssh_tunnel: SshTunnelManager::new(),
    })
    .setup(|app| {
      use tauri::Manager;

      let python_path = python::get_python_path(Some(app.handle()));
      println!("Detected Python path: {:?}", python_path);

      menu::setup_menu(app.handle())?;

      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        use tauri::window::{Effect, EffectsBuilder};
        let window = app.get_webview_window("main").unwrap();
        window.set_effects(
          EffectsBuilder::new()
            .effect(Effect::UnderPageBackground)
            .build(),
        )?;
      }

      // Pre-warm the TUI Gateway in the background
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let gateway = Arc::new(TuiGateway::new(app_handle.clone(), None));
        eprintln!("[SETUP] Pre-warming TUI Gateway...");
        match gateway.clone().start().await {
          Ok(_) => {
            let state = app_handle.state::<AppState>();
            let mut lock = state.gateway.lock().await;
            *lock = Some(gateway);
            eprintln!("[SETUP] TUI Gateway pre-warmed successfully");
          }
          Err(e) => {
            eprintln!("[SETUP] TUI Gateway pre-warm failed: {}", e);
          }
        }
      });

      // Test event delivery — frontend should see this 2s after startup
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let payload = serde_json::json!({
          "type": "test.ping",
          "sid": null,
          "payload": { "message": "Event system OK" }
        });
        eprintln!("[SETUP] Emitting test event...");
        match handle.emit_to("main", "tui-event", &payload) {
          Ok(_) => eprintln!("[SETUP] Test event emitted to main window"),
          Err(e) => eprintln!("[SETUP] Test event emit FAILED: {}", e),
        }
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![abort_chat, add_memory_entry, add_model, adopt_hermes_home, cancel_oauth_login, check_for_updates, check_install, clear_staged_attachments, copy_to_clipboard, create_cron_job, create_profile, delete_profile, delete_session, discover_memory_providers, discover_provider_models, download_update, gateway_status, get_app_version, get_config, get_connection_config, get_credential_pool, get_env, get_hermes_home, get_hermes_version, get_locale, get_model_aliases, get_model_config, get_platform_enabled, get_plugins, get_session_messages, get_skill_content, get_toolsets, inspect_install_target, install_skill, install_update, is_remote_mode, is_remote_only_mode, is_ssh_tunnel_active, kanban_archive_task, kanban_assign_task, kanban_block_task, kanban_comment_task, kanban_complete_task, kanban_create_board, kanban_create_task, kanban_current_board, kanban_dispatch_once, kanban_get_task, kanban_list_boards, kanban_list_tasks, kanban_reclaim_task, kanban_remove_board, kanban_specify_task, kanban_switch_board, kanban_unblock_task, list_bundled_skills, list_cached_sessions, list_cron_history, list_cron_jobs, list_installed_skills, list_mcp_servers, list_models, list_profiles, list_sessions, list_templates, oauth_login, open_external, pause_cron_job, quit_app, read_config_yaml, read_cron_output, read_logs, read_memory, read_soul, refresh_hermes_version, remove_cron_job, remove_memory_entry, remove_model, reset_soul, resume_cron_job, run_hermes_backup, run_hermes_doctor, run_hermes_dump, run_hermes_import, run_hermes_update, search_sessions, select_folder, select_hermes_folder, send_message, set_active_profile, set_config, set_connection_config, set_credential_pool, set_env, set_locale, set_model_config, set_platform_enabled, set_plugin_enabled, set_ssh_config, set_toolset_enabled, stage_attachment, start_gateway, start_install, start_ssh_tunnel, stop_gateway, stop_ssh_tunnel, sync_session_cache, test_remote_connection, test_ssh_connection, trigger_cron_job, tui_approval_respond, tui_clarify_respond, tui_commands_catalog, tui_complete_slash, tui_compress, tui_create_session, tui_interrupt, tui_resume_session, tui_session_branch, tui_session_history, tui_session_status, tui_session_title, tui_session_usage, tui_set_goal, tui_set_model, tui_slash_exec, tui_submit_prompt, tui_tools_configure, tui_tools_list, tui_tools_show, tui_undo, uninstall_skill, update_cron_job, update_memory_entry, update_model, update_session_title, validate_hermes_home, verify_install, voice_tts, write_config_yaml, write_memory, write_soul, write_user_profile])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
