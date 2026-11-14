import { Bridge, type ModelInfo } from "../core/bridge";
import { h } from "../views/dom";
import { t } from "../i18n/i18n";
import { dropdownSelect } from "../views/dropdown";

// Verified against Google AI's catalog. Account discovery replaces these
// choices when a key is present; never replace a saved model automatically.
export const GEMINI_MODELS: ModelInfo[] = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

export function geminiModelControl(saved: () => string, save: (id: string) => Promise<void>) {
  const initialChoices: [string, string][] = GEMINI_MODELS.map(model => [model.id, model.label]);
  const current = saved();
  if (current && !initialChoices.some(([id]) => id === current)) {
    initialChoices.push([current, current]);
  }

  const select = dropdownSelect<string>(
    initialChoices,
    current,
    async (next) => {
      if (saving || !next || next === saved()) return;
      saving = true;
      saveError = "";
      controls();
      try {
        await save(next);
      } catch (error) {
        saveError = String(error).replace(/^Error:\s*/, "");
      } finally {
        saving = false;
        render();
      }
    },
    { ariaLabel: t("Model"), class: "hub-select" },
  );

  const refresh = h("button", { text: t("Refresh") }) as HTMLButtonElement;
  const feedback = h("div", { class: "hint", role: "status" });
  const element = h("div", {}, h("div", { class: "row" }, h("label", { text: t("Model") }), select, refresh), feedback);
  let models = GEMINI_MODELS;
  let hasKey = false, loading = false, saving = false, generation = 0;
  let loadError = "", saveError = "";

  function controls() {
    select.disabled = saving;
    refresh.disabled = !hasKey || loading || saving;
    feedback.textContent = saveError || loadError || (loading ? t("Loading models…") : "");
  }

  function render() {
    const choices = new Map(models.map(model => [model.id, model.label]));
    const cur = saved();
    if (cur && !choices.has(cur)) choices.set(cur, cur);
    select.setOptions(Array.from(choices.entries()));
    select.value = cur;
    controls();
  }

  async function reload(present = hasKey) {
    hasKey = present;
    const request = ++generation;
    loading = present;
    loadError = "";
    controls();
    if (!present) { models = GEMINI_MODELS; if (!saving) render(); return; }
    try {
      const received = await Bridge.chatModels("google");
      if (request !== generation) return;
      if (received && received.length > 0) {
        models = received;
      }
    } catch (error) {
      if (request !== generation) return;
      loadError = String(error).replace(/^Error:\s*/, "");
    } finally {
      if (request === generation) { loading = false; if (!saving) render(); controls(); }
    }
  }

  refresh.addEventListener("click", () => { if (!refresh.disabled) void reload(); });
  render();
  return { element, reload };
}

