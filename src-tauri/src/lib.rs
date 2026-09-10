use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Показывает главное окно и, если передан номер, просит интерфейс открыть эту заявку.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle, repair_id: Option<i64>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Главное окно не найдено")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().ok();
    window.set_focus().map_err(|e| e.to_string())?;
    if let Some(id) = repair_id {
        app.emit("repairs:open", id).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Переключает видимость плавающего виджета.
#[tauri::command]
fn toggle_widget(app: tauri::AppHandle) -> Result<bool, String> {
    let widget = app.get_webview_window("widget").ok_or("Окно виджета не найдено")?;
    let visible = widget.is_visible().map_err(|e| e.to_string())?;
    if visible {
        widget.hide().map_err(|e| e.to_string())?;
    } else {
        widget.show().map_err(|e| e.to_string())?;
        widget.set_focus().ok();
    }
    Ok(!visible)
}

/// Сообщает остальным окнам, что данные изменились.
#[tauri::command]
fn notify_changed(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("repairs:changed", ()).map_err(|e| e.to_string())
}

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_repairs_tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS repairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number      TEXT NOT NULL UNIQUE,
                received_at TEXT NOT NULL,
                equipment   TEXT NOT NULL,
                serial_no   TEXT,
                from_whom   TEXT,
                contact     TEXT,
                location    TEXT,
                problem     TEXT,
                status      TEXT NOT NULL,
                notes       TEXT,
                issued_at   TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS status_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repair_id   INTEGER NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
                from_status TEXT,
                to_status   TEXT NOT NULL,
                comment     TEXT,
                at          TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repair_id  INTEGER NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
                file_name  TEXT NOT NULL,
                stored_as  TEXT NOT NULL,
                preview_as TEXT,
                mime       TEXT NOT NULL DEFAULT '',
                kind       TEXT NOT NULL,
                category   TEXT NOT NULL DEFAULT 'doc',
                size       INTEGER NOT NULL DEFAULT 0,
                caption    TEXT,
                added_at   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
            CREATE INDEX IF NOT EXISTS idx_repairs_received ON repairs(received_at);
            CREATE INDEX IF NOT EXISTS idx_events_repair ON status_events(repair_id);
            CREATE INDEX IF NOT EXISTS idx_files_repair ON attachments(repair_id);
        "#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:services.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            toggle_widget,
            notify_changed
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Открыть окно", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "Показать виджет", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &widget, &quit])?;

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Сервис — ремонт оборудования")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().ok();
                            window.unminimize().ok();
                            window.set_focus().ok();
                        }
                    }
                    "widget" => {
                        if let Some(window) = app.get_webview_window("widget") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                window.hide().ok();
                            } else {
                                window.show().ok();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            window.show().ok();
                            window.set_focus().ok();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
