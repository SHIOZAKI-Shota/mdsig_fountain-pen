import { reactive } from "vue";
import { native, readJson } from "./native.ts";

export interface Settings {
  lang: "auto" | "ja" | "en";
  theme: "system" | "light" | "dark";
  network: boolean;
  checkRevocation: boolean;
  fetchResources: boolean;
  tsaUrl: string;
  tsaRoots: string[];
  signingPages: string[];
  keyserver: string;
  keyFile: string;
  showHidden: boolean;
  fullText: boolean;
}

export const DEFAULTS: Settings = {
  lang: "auto",
  theme: "system",
  network: true,
  checkRevocation: true,
  fetchResources: false,
  tsaUrl: "http://ts.ssl.com",
  tsaRoots: [],
  signingPages: [],
  keyserver: "",
  keyFile: "",
  showHidden: true,
  fullText: false,
};

export const settings = reactive<Settings>({ ...DEFAULTS });

export async function loadSettings() {
  Object.assign(settings, DEFAULTS, await readJson<Partial<Settings>>(native.localRead("settings.json"), {}));
}

export async function saveSettings() {
  await native.localWrite("settings.json", JSON.stringify(settings, null, 2));
}

export async function loadLast(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(native.localRead("last.json"), {});
}

export async function saveLast(patch: Record<string, string>) {
  await native.localWrite("last.json", JSON.stringify({ ...(await loadLast()), ...patch }));
}
