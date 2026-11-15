// Windows native notification listener for Coucou.
// Uses Windows.UI.Notifications.Management.UserNotificationListener (WinRT)
// to capture incoming system and app toast notifications (WhatsApp, Discord, Mail, etc.)
// and forwards them to the island webview via the "windows-notification" event.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsNotificationPayload {
    pub id: String,
    pub app: String,
    pub app_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
    pub title: String,
    pub body: String,
    pub timestamp: u64,
    pub source: String,
    pub unread: bool,
}

static LISTENER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Spawns the background notification poller if not already running.
pub fn start_listener(app: AppHandle) {
    if LISTENER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        run_listener(app);
    });
}

#[cfg(windows)]
fn run_listener(app: AppHandle) {
    use windows::UI::Notifications::KnownNotificationBindings;
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::NotificationKinds;

    let listener = match UserNotificationListener::Current() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[Notifications] UserNotificationListener::Current() failed: {e}");
            LISTENER_RUNNING.store(false, Ordering::SeqCst);
            return;
        }
    };

    // Request access if not already granted
    let status = match listener.RequestAccessAsync().and_then(|op| op.get()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[Notifications] RequestAccessAsync() failed: {e}");
            LISTENER_RUNNING.store(false, Ordering::SeqCst);
            return;
        }
    };

    if status != UserNotificationListenerAccessStatus::Allowed {
        eprintln!("[Notifications] Notification access not allowed: {:?}", status);
        LISTENER_RUNNING.store(false, Ordering::SeqCst);
        return;
    }

    // Seed existing notification IDs so we don't spam popups on initial startup
    let mut known_ids = HashSet::new();
    if let Ok(notifs) = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .and_then(|op| op.get())
    {
        for n in &notifs {
            if let Ok(id) = n.Id() {
                known_ids.insert(id);
            }
        }
    }

    loop {
        std::thread::sleep(Duration::from_millis(1000));

        let notifs = match listener
            .GetNotificationsAsync(NotificationKinds::Toast)
            .and_then(|op| op.get())
        {
            Ok(n) => n,
            Err(_) => continue,
        };

        let mut current_ids = HashSet::new();
        for n in &notifs {
            let id = match n.Id() {
                Ok(id) => id,
                Err(_) => continue,
            };
            current_ids.insert(id);

            if !known_ids.contains(&id) {
                // New notification arrived! Extract fields
                let app_name = n
                    .AppInfo()
                    .and_then(|info| info.DisplayInfo())
                    .and_then(|disp| disp.DisplayName())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|_| "Windows".to_string());

                let mut title = app_name.clone();
                let mut body_lines = Vec::new();

                if let Ok(notif_obj) = n.Notification() {
                    if let Ok(visual) = notif_obj.Visual() {
                        if let Ok(binding_name) = KnownNotificationBindings::ToastGeneric() {
                            if let Ok(binding) = visual.GetBinding(&binding_name) {
                                if let Ok(texts) = binding.GetTextElements() {
                                    let mut first = true;
                                    for t in &texts {
                                        if let Ok(text_val) = t.Text() {
                                            let s = text_val.to_string();
                                            if !s.trim().is_empty() {
                                                if first {
                                                    title = s;
                                                    first = false;
                                                } else {
                                                    body_lines.push(s);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let body = body_lines.join(" · ");
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                let source = if app_name.to_lowercase().contains("whatsapp") {
                    "whatsapp".to_string()
                } else {
                    "windows".to_string()
                };

                let payload = WindowsNotificationPayload {
                    id: format!("win-{}", id),
                    app: app_name.clone(),
                    app_name,
                    app_id: None,
                    icon: None,
                    accent_color: None,
                    title,
                    body,
                    timestamp,
                    source,
                    unread: true,
                };

                let _ = app.emit_to(crate::island::WINDOW_LABEL, "windows-notification", &payload);
                known_ids.insert(id);
            }
        }

        // Clean up known_ids that are no longer in active toast store
        known_ids.retain(|id| current_ids.contains(id));
    }
}

#[cfg(not(windows))]
fn run_listener(_app: AppHandle) {}
