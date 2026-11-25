import ja from "./ja.json" with { type: "json" };

export type Lang = "ja" | "en";

const dict: Record<Lang, Record<string, string>> = { ja: ja as Record<string, string>, en: {} };

let current: Lang = "ja";
const listeners = new Set<(l: Lang) => void>();

export function setLang(l: Lang) {
  current = l;
  listeners.forEach((f) => f(l));
}

export function getLang(): Lang {
  return current;
}

export function onLang(f: (l: Lang) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function detectLang(navLang: string | undefined): Lang {
  return navLang?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function t(message: string, ...args: (string | number)[]): string {
  const s = dict[current][message] ?? message;
  return s.replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}
