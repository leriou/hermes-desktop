use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};

fn open_url(app: &AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell().open(url, None).map_err(|e| e.to_string())
}

pub fn setup_menu(app: &AppHandle) -> tauri::Result<()> {
    let handle = app;
    
    let new_chat_item = MenuItem::with_id(handle, "menu-new-chat", "New Chat", true, Some("CmdOrCtrl+N"))?;
    let search_sessions_item = MenuItem::with_id(handle, "menu-search-sessions", "Search Sessions", true, Some("CmdOrCtrl+K"))?;
    
    let chat_submenu = Submenu::with_items(
        handle,
        "Chat",
        true,
        &[
            &new_chat_item,
            &PredefinedMenuItem::separator(handle)?,
            &search_sessions_item,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let app_submenu = Submenu::with_items(
        handle,
        "Hermes Agent",
        true,
        &[
            &PredefinedMenuItem::about(handle, None, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::show_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let edit_submenu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    let view_submenu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &MenuItem::with_id(handle, "menu-reset-zoom", "Reset Zoom", true, Some("CmdOrCtrl+0"))?,
            &MenuItem::with_id(handle, "menu-zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?,
            &MenuItem::with_id(handle, "menu-zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    let window_submenu = {
        #[cfg(target_os = "macos")]
        {
            Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &MenuItem::with_id(handle, "menu-zoom", "Zoom", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &MenuItem::with_id(handle, "menu-bring-all-to-front", "Bring All to Front", true, None::<&str>)?,
                ],
            )?
        }
        #[cfg(not(target_os = "macos"))]
        {
            Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &MenuItem::with_id(handle, "menu-zoom", "Zoom", true, None::<&str>)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?
        }
    };

    let help_github = MenuItem::with_id(handle, "menu-help-github", "Hermes Agent on GitHub", true, None::<&str>)?;
    let help_report = MenuItem::with_id(handle, "menu-help-report", "Report an Issue", true, None::<&str>)?;
    let help_submenu = Submenu::with_items(
        handle,
        "Help",
        true,
        &[
            &help_github,
            &help_report,
        ],
    )?;
    
    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(handle, &[&app_submenu, &chat_submenu, &edit_submenu, &view_submenu, &window_submenu, &help_submenu])?;

    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(handle, &[&chat_submenu, &edit_submenu, &view_submenu, &window_submenu, &help_submenu])?;

    handle.set_menu(menu)?;

    handle.on_menu_event(move |app_handle, event| {
        match event.id().as_ref() {
            "menu-new-chat" => { let _ = app_handle.emit("menunewchat", ()); }
            "menu-search-sessions" => { let _ = app_handle.emit("menusearchsessions", ()); }
            "menu-reset-zoom" => { if let Some(w) = app_handle.get_webview_window("main") { let _ = w.eval("window.__tauriZoomLevel=1;if(window.__TAURI_INTERNALS__){import('@tauri-apps/api/webview').then(m=>m.getCurrentWebview().setZoom(1))}"); } }
            "menu-zoom-in" => { if let Some(w) = app_handle.get_webview_window("main") { let _ = w.eval("window.__tauriZoomLevel=Math.min(3,(window.__tauriZoomLevel||1)+0.1);if(window.__TAURI_INTERNALS__){import('@tauri-apps/api/webview').then(m=>m.getCurrentWebview().setZoom(window.__tauriZoomLevel))}"); } }
            "menu-zoom-out" => { if let Some(w) = app_handle.get_webview_window("main") { let _ = w.eval("window.__tauriZoomLevel=Math.max(0.3,(window.__tauriZoomLevel||1)-0.1);if(window.__TAURI_INTERNALS__){import('@tauri-apps/api/webview').then(m=>m.getCurrentWebview().setZoom(window.__tauriZoomLevel))}"); } }
            "menu-help-github" => { let _ = open_url(app_handle, "https://github.com/NousResearch/hermes-agent/"); }
            "menu-help-report" => { let _ = open_url(app_handle, "https://github.com/fathah/hermes-desktop/issues"); }
            "menu-zoom" => { if let Some(w) = app_handle.get_webview_window("main") { let _ = w.eval("window.__tauriZoomLevel=(window.__tauriZoomLevel||1)===1?1.5:1;if(window.__TAURI_INTERNALS__){import('@tauri-apps/api/webview').then(m=>m.getCurrentWebview().setZoom(window.__tauriZoomLevel))}"); } }
            "menu-bring-all-to-front" => { if let Some(w) = app_handle.get_webview_window("main") { let _ = w.set_focus(); } }
            _ => {}
        }
    });
    
    Ok(())
}
