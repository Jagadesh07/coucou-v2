// Windows notifications: NotificationCenter, WhatsApp incoming message expansion,
// Island notification banner, and auto-dismiss lifecycle.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import {
  NotificationCenter,
  appAccentColor,
  appGlyph,
} from "../src/core/notifications.ts";
import { handlePillEvent } from "../src/island/whatsapp.ts";
import { DEFAULT_SETTINGS, State } from "../src/core/state.ts";
import { WHATSAPP_ID, WhatsApp, IDLE_WHATSAPP } from "../src/core/whatsapp.ts";

installFakeDom();

beforeEach(() => {
  State.settings = { ...DEFAULT_SETTINGS, activeIntegrations: [WHATSAPP_ID] };
  State.tasks = [];
  State.loadIntegrationTasks();
  NotificationCenter.clear();
  WhatsApp.view = { ...IDLE_WHATSAPP };
});

test("NotificationCenter: formatting, accent colors, and listener dispatch", () => {
  assert.equal(appAccentColor("WhatsApp"), "#25D366");
  assert.equal(appAccentColor("Windows"), "#00A4EF");
  assert.equal(appAccentColor("Outlook"), "#0078D4");
  assert.equal(appAccentColor("Slack"), "#E01E5A");
  assert.equal(appGlyph("WhatsApp"), "WA");
  assert.equal(appGlyph("Windows"), "⊞");

  const received = [];
  const unsubscribe = NotificationCenter.subscribe((n) => received.push(n));

  const notif = NotificationCenter.notify({
    app: "WhatsApp",
    title: "Marie",
    body: "Coucou!",
  });

  assert.equal(notif.app, "WhatsApp");
  assert.equal(notif.title, "Marie");
  assert.equal(notif.body, "Coucou!");
  assert.equal(notif.accentColor, "#25D366");
  assert.equal(notif.unread, true);
  assert.equal(received.length, 1);
  assert.equal(NotificationCenter.active?.id, notif.id);

  NotificationCenter.dismiss(notif.id);
  assert.equal(NotificationCenter.active, null);

  unsubscribe();
});

test("WhatsApp: incoming message triggers NotificationCenter and calls showNotification", () => {
  const notifications = [];
  const host = {
    reveals: 0,
    emotes: [],
    reveal() {
      this.reveals++;
    },
    emote(name) {
      this.emotes.push(name);
    },
    showNotification(n) {
      notifications.push(n);
    },
  };

  handlePillEvent(host, { kind: "message", name: "Marie" }, 10_000);

  assert.equal(host.reveals, 1);
  assert.deepEqual(host.emotes, ["happy"]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].app, "WhatsApp");
  assert.equal(notifications[0].title, "Marie");
  assert.equal(NotificationCenter.active?.title, "Marie");
});

test("Notification banner: show, open, and dismiss", async () => {
  try {
    const { buildNotificationBanner } = await import("../src/views/notifications.ts");

    let opened = null;
    let dismissed = null;

    const banner = buildNotificationBanner({
      onOpen: (n) => {
        opened = n;
      },
      onDismiss: (n, collapse) => {
        dismissed = { n, collapse };
      },
    });

    const testNotif = {
      id: "notif-1",
      app: "Windows",
      title: "Windows Update",
      body: "Updates ready to install",
      timestamp: Date.now(),
    };

    banner.show(testNotif, 5000);
    assert.ok(banner.el.classList.contains("visible"));
    assert.ok(!banner.el.classList.contains("hidden"));

    const head = banner.el.childNodes[0];
    const closeBtn = head.childNodes[3];
    closeBtn.fire("click");
    assert.ok(dismissed);
    assert.equal(dismissed.n.id, "notif-1");
    assert.equal(dismissed.collapse, true);

    banner.show(testNotif, 5000);
    const actionsRow = banner.el.childNodes[2];
    const openBtn = actionsRow.childNodes[0];
    openBtn.fire("click");
    assert.ok(opened);
    assert.equal(opened.id, "notif-1");
  } catch (err) {
    console.error("TEST ERROR:", err);
    throw err;
  }
});
