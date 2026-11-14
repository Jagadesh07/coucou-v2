// Windows notifications — data models, event dispatching, and notification lifecycle.
// Supports Windows system notifications, WhatsApp, Outlook/Mail, Slack, Discord,
// and browser/webview push notifications.

import { State } from "./state";
import { WHATSAPP_ID } from "./whatsapp";

export interface WindowsNotification {
  id: string;
  app: string;
  appName?: string;
  appId?: string;
  icon?: string;
  accentColor?: string;
  title: string;
  body: string;
  timestamp: number;
  source?: "whatsapp" | "system" | "windows" | "app";
  unread?: boolean;
}

export type NotificationListener = (notif: WindowsNotification) => void;

/** App accent colors and glyphs */
const APP_METADATA: Record<string, { color: string; glyph: string }> = {
  whatsapp: { color: "#25D366", glyph: "WA" },
  windows: { color: "#00A4EF", glyph: "⊞" },
  system: { color: "#00A4EF", glyph: "⊞" },
  outlook: { color: "#0078D4", glyph: "✉" },
  mail: { color: "#0078D4", glyph: "✉" },
  slack: { color: "#E01E5A", glyph: "#" },
  teams: { color: "#5059C9", glyph: "T" },
  discord: { color: "#5865F2", glyph: "D" },
  github: { color: "#F4505E", glyph: "GH" },
  spotify: { color: "#1DB954", glyph: "♫" },
  calendar: { color: "#EA4335", glyph: "📅" },
  chrome: { color: "#4285F4", glyph: "G" },
};

export function appAccentColor(app: string): string {
  const key = (app || "").toLowerCase().trim();
  for (const [name, meta] of Object.entries(APP_METADATA)) {
    if (key.includes(name)) return meta.color;
  }
  return "#3B82F6";
}

export function appGlyph(app: string): string {
  const key = (app || "").toLowerCase().trim();
  for (const [name, meta] of Object.entries(APP_METADATA)) {
    if (key.includes(name)) return meta.glyph;
  }
  return (app.trim().slice(0, 2) || "●").toUpperCase();
}

let notificationSeq = 0;
const listeners = new Set<NotificationListener>();
const notificationsList: WindowsNotification[] = [];
let activeNotif: WindowsNotification | null = null;

export const NotificationCenter = {
  get notifications(): readonly WindowsNotification[] {
    return notificationsList;
  },

  get active(): WindowsNotification | null {
    return activeNotif;
  },

  subscribe(listener: NotificationListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Dispatches an incoming notification to all listeners and updates state. */
  notify(input: Partial<WindowsNotification>): WindowsNotification {
    const app = (input.app || "Windows").trim();
    const id = input.id || `notif-${Date.now()}-${++notificationSeq}`;
    const accentColor = input.accentColor || appAccentColor(app);
    const notif: WindowsNotification = {
      id,
      app,
      appName: input.appName || app,
      appId: input.appId || (app.toLowerCase() === "whatsapp" ? WHATSAPP_ID : undefined),
      icon: input.icon || appGlyph(app),
      accentColor,
      title: (input.title || app).trim(),
      body: (input.body || "").trim(),
      timestamp: input.timestamp || Date.now(),
      source: input.source || (app.toLowerCase() === "whatsapp" ? "whatsapp" : "windows"),
      unread: true,
    };

    // Prepend to list, capping at 30 entries
    notificationsList.unshift(notif);
    if (notificationsList.length > 30) {
      notificationsList.pop();
    }
    activeNotif = notif;

    for (const listener of listeners) {
      try {
        listener(notif);
      } catch (err) {
        console.error("[NotificationCenter] listener error", err);
      }
    }

    State.notify();
    return notif;
  },

  dismiss(id?: string) {
    if (!id || activeNotif?.id === id) {
      activeNotif = null;
    }
    if (id) {
      const idx = notificationsList.findIndex((n) => n.id === id);
      if (idx >= 0) {
        notificationsList[idx].unread = false;
      }
    }
    State.notify();
  },

  clear() {
    activeNotif = null;
    notificationsList.length = 0;
    State.notify();
  },
};

/**
 * Intercepts standard Web Notification API in browser/webview
 * and exposes window.coucouNotify for testing and extensions.
 */
export function installNotificationHooks() {
  if (typeof window === "undefined") return;

  (window as unknown as Record<string, unknown>).coucouNotify = (notif: Partial<WindowsNotification>) => {
    return NotificationCenter.notify(notif);
  };

  const win = window as unknown as Record<string, unknown>;
  const OriginalNotification = win.Notification as {
    new (title: string, options?: NotificationOptions): unknown;
    permission: NotificationPermission;
    requestPermission: () => Promise<NotificationPermission>;
  } | undefined;

  if (OriginalNotification && typeof OriginalNotification === "function") {
    try {
      const PatchedNotification = function (this: unknown, title: string, options?: NotificationOptions) {
        const opt = (options ?? {}) as Record<string, unknown>;
        const app = typeof opt.app === "string" ? opt.app : "Windows";
        const body = typeof options?.body === "string" ? options.body : "";
        NotificationCenter.notify({
          app,
          title,
          body,
          icon: typeof options?.icon === "string" ? options.icon : undefined,
          source: "windows",
        });
        try {
          return new OriginalNotification(title, options);
        } catch {
          return { close() {} };
        }
      };
      PatchedNotification.permission = OriginalNotification.permission;
      PatchedNotification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
      win.Notification = PatchedNotification;
    } catch {
      // Non-writable in some environments
    }
  }
}
