import { ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settings, saveSettings } from "./settings.ts";
import { isTauri } from "./native.ts";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");
export const dark = ref(false);

export function applyTheme() {
  const t = settings.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  dark.value = t === "dark" || (t === "system" && media().matches);
  if (isTauri()) void getCurrentWindow().setTheme(t === "system" ? null : t).catch(() => undefined);
}

export function watchSystemTheme() {
  media().addEventListener("change", () => {
    if (settings.theme === "system") applyTheme();
  });
}

export async function toggleTheme() {
  settings.theme = dark.value ? "light" : "dark";
  applyTheme();
  await saveSettings();
}
