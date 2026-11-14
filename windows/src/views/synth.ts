// Music Synthesizer / Audio Equalizer Visualizer for Spotify playback.
// Displays 4 bouncing vertical pill bars in the Dynamic Island.

import { h } from "./dom";

/**
 * Builds an animated 4-bar music synthesizer visualizer.
 */
export function buildMusicSynth(id?: string, extraClass = ""): HTMLElement {
  const b1 = h("span", { class: "synth-bar bar-1" });
  const b2 = h("span", { class: "synth-bar bar-2" });
  const b3 = h("span", { class: "synth-bar bar-3" });
  const b4 = h("span", { class: "synth-bar bar-4" });
  const attrs: Record<string, string> = {
    class: ["music-synth", extraClass].filter(Boolean).join(" "),
  };
  if (id) attrs.id = id;
  return h("div", attrs, b1, b2, b3, b4);
}
