import { ref } from "vue";
import { detectLang, setLang, t, type Lang } from "../lib/i18n.ts";
import { settings } from "./settings.ts";

export const lang = ref<Lang>("ja");

export function applyLang() {
  const l = settings.lang === "auto" ? detectLang(navigator.language) : settings.lang;
  setLang(l);
  lang.value = l;
  document.documentElement.lang = l;
}

export function tr(message: string, ...args: (string | number)[]): string {
  void lang.value;
  return t(message, ...args);
}
