// Windows notification banner & card views for the island.
// Slides into view smoothly when a notification arrives, provides interactive
// "Open" and "Close" controls, and auto-dismisses with an animated countdown.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { type WindowsNotification, appAccentColor, appGlyph } from "../core/notifications";
import { t, tl } from "../i18n/i18n";

export interface NotificationBannerActions {
  onOpen(notif: WindowsNotification): void;
  onDismiss(notif: WindowsNotification, collapseIfOpened?: boolean): void;
}

export interface NotificationBanner {
  el: HTMLElement;
  show(notif: WindowsNotification, autoCloseMs?: number): void;
  dismiss(collapseIfOpened?: boolean): void;
  sync(): void;
}

export function buildNotificationBanner(actions: NotificationBannerActions): NotificationBanner {
  const notifDot = h("span", { class: "notif-dot" });
  const notifAppName = h("span", { class: "notif-app-name" });
  const notifTime = h("span", { class: "notif-time", text: t("just now") });
  const notifCloseIcon = h("button", { class: "notif-close-icon", title: tl("Close") }, svg(ICONS.xmark, 10));
  const head = h("div", { class: "notif-head" }, notifDot, notifAppName, notifTime, notifCloseIcon);

  const notifAvatar = h("div", { class: "notif-avatar" });
  const notifTitle = h("div", { class: "notif-title" });
  const notifBody = h("div", { class: "notif-body" });
  const textCol = h("div", { class: "notif-text-col" }, notifTitle, notifBody);
  const contentRow = h("div", { class: "notif-content-row" }, notifAvatar, textCol);

  const openBtn = h("button", { class: "notif-btn notif-btn-open", text: t("Open") });
  const dismissBtn = h("button", { class: "notif-btn notif-btn-dismiss", text: t("Close") });
  const actionsRow = h("div", { class: "notif-actions" }, openBtn, dismissBtn);

  const progressBar = h("div", { class: "notif-progress-fill" });
  const progressTrack = h("div", { class: "notif-progress-track" }, progressBar);

  const el = h("div", { id: "island-notification", class: "hidden" }, head, contentRow, actionsRow, progressTrack);

  let currentNotif: WindowsNotification | null = null;
  let timer: number | null = null;
  let isHovered = false;
  let remainingMs = 7000;
  let lastTick = 0;

  function clearTimer() {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(ms: number) {
    clearTimer();
    remainingMs = ms;
    lastTick = performance.now();
    progressBar.style.animationDuration = `${ms}ms`;
    progressBar.classList.remove("animating");
    void progressBar.offsetWidth; // trigger reflow
    progressBar.classList.add("animating");

    const tick = () => {
      if (isHovered) {
        lastTick = performance.now();
        timer = window.setTimeout(tick, 200);
        return;
      }
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      remainingMs -= elapsed;

      if (remainingMs <= 0) {
        clearTimer();
        dismiss(true);
      } else {
        timer = window.setTimeout(tick, 100);
      }
    };
    timer = window.setTimeout(tick, 100);
  }

  function dismiss(collapseIfOpened = true) {
    clearTimer();
    if (!currentNotif) return;
    const notif = currentNotif;
    el.classList.add("leaving");
    el.classList.remove("visible");

    window.setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("leaving");
      if (currentNotif === notif) {
        currentNotif = null;
      }
    }, 280);

    actions.onDismiss(notif, collapseIfOpened);
  }

  function open() {
    clearTimer();
    if (!currentNotif) return;
    const notif = currentNotif;
    dismiss(false);
    actions.onOpen(notif);
  }

  notifCloseIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss(true);
  });

  dismissBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss(true);
  });

  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    open();
  });

  el.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest?.(".notif-close-icon") || target.closest?.(".notif-btn-dismiss")) return;
    e.stopPropagation();
    open();
  });

  el.addEventListener("mouseenter", () => {
    isHovered = true;
    el.classList.add("paused");
  });

  el.addEventListener("mouseleave", () => {
    isHovered = false;
    el.classList.remove("paused");
  });

  return {
    el,
    show(notif: WindowsNotification, autoCloseMs = 7000) {
      currentNotif = notif;
      const accent = notif.accentColor || appAccentColor(notif.app);
      el.style.setProperty("--notif-accent", accent);

      notifAppName.textContent = notif.appName || notif.app || "Windows";
      notifTitle.textContent = notif.title || notif.app || "Notification";
      notifBody.textContent = notif.body || "";
      notifAvatar.textContent = notif.icon || appGlyph(notif.app);

      el.classList.remove("hidden");
      el.classList.remove("leaving");
      el.classList.remove("paused");
      void el.offsetWidth;
      el.classList.add("visible");

      startTimer(autoCloseMs);
    },
    dismiss(collapseIfOpened = true) {
      dismiss(collapseIfOpened);
    },
    sync() {
      // Keep label synced on language change
      notifTime.textContent = t("just now");
    },
  };
}
