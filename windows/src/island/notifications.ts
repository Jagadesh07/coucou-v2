// Island Windows notification event handlers and bridge wiring.
// Listens for notifications from the Tauri backend, Web Notification API,
// and the local NotificationCenter dispatcher.

import { onEvent } from "../core/bridge";
import { NotificationCenter, installNotificationHooks, type WindowsNotification } from "../core/notifications";
import { State } from "../core/state";
import type { Island } from "./island";

export function registerNotificationHandlers(island: Island) {
  // Intercept standard Web Notification API & expose window.coucouNotify
  installNotificationHooks();

  // Listen for events from Tauri or relay
  void onEvent<WindowsNotification>("windows-notification", (n) => {
    if (State.settings.windowsNotifications !== false) {
      NotificationCenter.notify(n);
    }
  });

  void onEvent<WindowsNotification>("notification", (n) => {
    if (State.settings.windowsNotifications !== false) {
      NotificationCenter.notify(n);
    }
  });

  // Whenever a notification is posted to NotificationCenter, display on Island
  NotificationCenter.subscribe((notif) => {
    if (State.settings.windowsNotifications !== false) {
      island.showNotification(notif);
    }
  });
}
