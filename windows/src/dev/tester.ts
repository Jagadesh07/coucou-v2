// Interactive feature tester for browser and dev mode.
// Provides 1-click visual verification for all recently added island features:
// - Vibrant gradient clock & non-shrinking closed/compact island
// - Spotify equalizer synthesizer visualizer
// - Windows notifications auto-expansion & 7s timer
// - WhatsApp notification integration & pill lighting
// - Google Gemini aura gradient background
// - Mini characters with bouncy puppy ears
// - Windows system username in header

import { State } from "../core/state";
import { NotificationCenter } from "../core/notifications";
import { SPOTIFY_ID, Spotify } from "../core/spotify";
import type { Island } from "../island/island";
import { h } from "../views/dom";

export function initDevTester(island: Island) {
  if (typeof document === "undefined") return;

  // Avoid duplicate injection
  if (document.getElementById("dev-tester")) return;

  let isCollapsed = false;

  const bar = h("div", { id: "dev-tester" });

  const updateStatus = () => {
    const statusPill = bar.querySelector(".tester-status");
    if (statusPill) {
      statusPill.textContent = `Mode: ${State.mode} | View: ${State.view}`;
    }
  };

  const actions = [
    {
      label: "🕒 Clock (Compact)",
      title: "Test compact island gradient clock (Bricolage Grotesque with vertical gradient)",
      run: () => {
        State.settings.showClock = true;
        Spotify.state.playing = false;
        Spotify.state.track = null;
        island.setMode("compact");
        island.applySettings();
        State.notify();
      },
    },
    {
      label: "🕒 Clock (Closed - No Shrink)",
      title: "Test closed island clock maintaining full 288px island size without shrinking",
      run: () => {
        State.settings.closedIsland = "datetime";
        State.settings.showClock = true;
        island.setMode("hidden");
        island.applySettings();
        State.notify();
      },
    },
    {
      label: "🎵 Spotify Synth",
      title: "Toggle Spotify playback and pulsing equalizer synthesizer in island center",
      run: () => {
        if (!State.settings.activeIntegrations.includes(SPOTIFY_ID)) {
          State.settings.activeIntegrations.push(SPOTIFY_ID);
        }
        const playing = !Spotify.state.playing;
        Spotify.state.playing = playing;
        Spotify.state.track = playing
          ? {
              id: "spotify:track:test",
              title: "Midnight City",
              artist: "M83",
              album: "Hurry Up, We're Dreaming",
              duration: 244,
              artUrl: null,
            }
          : null;
        if (playing) {
          island.setMode("compact");
        }
        island.applySettings();
        State.notify();
      },
    },
    {
      label: "🔔 Windows Notification",
      title: "Simulate an incoming Windows system notification with 7s auto-dismiss progress bar",
      run: () => {
        NotificationCenter.notify({
          app: "Slack",
          appName: "Slack",
          title: "Elena Vance",
          body: "Shared the updated designs in #general. Check them out!",
          icon: "#",
          source: "windows",
        });
      },
    },
    {
      label: "💬 WhatsApp Notification",
      title: "Simulate incoming WhatsApp message and light up the WhatsApp pill",
      run: () => {
        NotificationCenter.notify({
          app: "WhatsApp",
          appName: "WhatsApp",
          title: "Sarah Miller",
          body: "Hey! Are you free for a quick call?",
          icon: "WA",
          source: "whatsapp",
        });
      },
    },
    {
      label: "🌌 Gemini Aura Island",
      title: "Open island to reveal Google Gemini aura gradient with flowing blue glow",
      run: () => {
        island.expand("overview");
        State.notify();
      },
    },
    {
      label: "🐶 Puppy Ears (Mini Bots)",
      title: "Populate mini bot agents to display characters with animated puppy ears",
      run: () => {
        State.tasks = [
          {
            id: "task_1",
            name: "Claude Code",
            color: "#D97706",
            state: "working",
            stepIndex: 1,
            steps: ["Updating ear geometry"],
            source: "agent",
            isIntegration: false,
          },
          {
            id: "task_2",
            name: "Gemini CLI",
            color: "#3B82F6",
            state: "thinking",
            stepIndex: 1,
            steps: ["Synthesizing aura glow"],
            source: "agent",
            isIntegration: false,
          },
        ];
        island.setMode("compact");
        State.notify();
      },
    },
    {
      label: "👤 Windows User",
      title: "Open overview and inspect detected Windows username in header",
      run: () => {
        island.expand("overview");
        State.notify();
        const userEl = document.querySelector("#header .user-name") as HTMLElement;
        if (userEl) {
          userEl.style.outline = "2px solid #38bdf8";
          userEl.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.8)";
          setTimeout(() => {
            userEl.style.outline = "";
            userEl.style.boxShadow = "";
          }, 2500);
        }
      },
    },
    {
      label: "⚙️ Settings",
      title: "Open Settings view",
      run: () => {
        island.alert("settings");
      },
    },
    {
      label: "↺ Reset",
      title: "Reset state to normal compact mode",
      run: () => {
        Spotify.state.playing = false;
        Spotify.state.track = null;
        State.tasks = [];
        NotificationCenter.clear();
        island.setMode("compact");
        island.setView("overview");
        island.applySettings();
        State.notify();
      },
    },
  ];

  // Header
  const header = h(
    "div",
    { class: "tester-header" },
    h(
      "div",
      { class: "tester-title-wrap" },
      h("span", { class: "tester-badge", text: "DEV" }),
      h("strong", { text: "Feature Tester" }),
      h("span", { class: "tester-status", text: "Ready" }),
    ),
    h("div", { class: "tester-controls" },
      h("button", {
        class: "tester-toggle-btn",
        text: "—",
        title: "Collapse / expand tester bar (shortcut: ` or Alt+T)",
        onclick: (e) => {
          e.stopPropagation();
          isCollapsed = !isCollapsed;
          bar.classList.toggle("collapsed", isCollapsed);
          (e.currentTarget as HTMLElement).textContent = isCollapsed ? "🧪 Features" : "—";
        },
      }),
    ),
  );

  // Buttons container
  const btnGrid = h("div", { class: "tester-buttons" });
  for (const act of actions) {
    const btn = h("button", {
      class: "tester-btn",
      text: act.label,
      title: act.title,
      onclick: () => {
        act.run();
        updateStatus();
      },
    });
    btnGrid.appendChild(btn);
  }

  bar.appendChild(header);
  bar.appendChild(btnGrid);
  document.body.appendChild(bar);

  // Keyboard shortcut toggle: ` (Backquote) or Alt+T
  window.addEventListener("keydown", (e) => {
    if (e.key === "`" || (e.altKey && e.key.toLowerCase() === "t")) {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;
      isCollapsed = !isCollapsed;
      bar.classList.toggle("collapsed", isCollapsed);
      const toggleBtn = bar.querySelector(".tester-toggle-btn") as HTMLElement;
      if (toggleBtn) {
        toggleBtn.textContent = isCollapsed ? "🧪 Features" : "—";
      }
    }
  });

  // Expose on window for direct devtools console usage
  (window as unknown as Record<string, unknown>).__coucouTester = {
    clockCompact: actions[0].run,
    clockClosed: actions[1].run,
    spotify: actions[2].run,
    notification: actions[3].run,
    whatsapp: actions[4].run,
    aura: actions[5].run,
    puppyEars: actions[6].run,
    user: actions[7].run,
    settings: actions[8].run,
    reset: actions[9].run,
  };
}
