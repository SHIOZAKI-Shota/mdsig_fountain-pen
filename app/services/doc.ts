import { reactive } from "vue";
import type { Entry } from "../lib/entry.ts";
import { t } from "../lib/i18n.ts";
import { native, type OpenedDoc } from "./native.ts";
import { runVerify } from "./verify.ts";

export type Mode = "preview" | "status" | "edit";
export type Sheet = null | "sign" | "setup" | "settings" | "keys";

export interface Doc {
  path: string | null;
  name: string;
  text: string;
  saved: string;
}

export const state = reactive({
  doc: null as Doc | null,
  entry: null as Entry | null,
  verifying: false,
  mode: "preview" as Mode,
  sheet: null as Sheet,
  notice: null as null | { text: string; tone: "ok" | "bad" | "muted" },
  recent: [] as string[],
  reveal: null as null | { line: number; seq: number },
  signScope: null as string[] | null,
});

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

export const dirty = () => !!state.doc && state.doc.text !== state.doc.saved;

export function notify(text: string, tone: "ok" | "bad" | "muted" = "muted") {
  state.notice = { text, tone };
  setTimeout(() => {
    if (state.notice?.text === text) state.notice = null;
  }, 6000);
}

export async function verifyNow(online = true, acceptNewKey = false) {
  const d = state.doc;
  if (!d) return;
  const my = ++seq;
  state.verifying = true;
  try {
    const e = await runVerify({ path: d.path, text: d.text }, { online, acceptNewKey });
    if (my !== seq || state.doc !== d) return;
    if (!online && state.entry?.online && state.entry.text === e.text) return;
    state.entry = e;
  } finally {
    if (my === seq) state.verifying = false;
  }
}

function load(o: OpenedDoc) {
  state.doc = { path: o.path, name: o.name, text: o.text, saved: o.text };
  state.entry = null;
  state.mode = "preview";
  state.sheet = null;
  void verifyNow(true);
  void refreshRecent();
}

function openError(e: unknown) {
  notify(String(e) === "not-utf8" ? t("This file is not UTF-8 text, so it cannot be a signed Markdown document.") : t("Could not open the file: {0}", String(e)), "bad");
}

export async function refreshRecent() {
  state.recent = await native.recent().catch(() => []);
}

export async function openPath(path: string) {
  try {
    load(await native.openDocument(path));
  } catch (e) {
    openError(e);
  }
}

export async function openDialog() {
  try {
    const o = await native.openDialog();
    if (o) load(o);
  } catch (e) {
    openError(e);
  }
}

export function newDocument() {
  state.doc = { path: null, name: t("Untitled.md"), text: "", saved: "" };
  state.entry = null;
  state.mode = "edit";
  state.sheet = null;
  void verifyNow(false);
}

export function closeDocument() {
  state.doc = null;
  state.entry = null;
  state.sheet = null;
  void refreshRecent();
}

export function setText(text: string, o: { online?: boolean } = {}) {
  if (!state.doc) return;
  state.doc.text = text;
  clearTimeout(timer);
  if (o.online) void verifyNow(true);
  else timer = setTimeout(() => void verifyNow(false), 800);
}

export async function save(): Promise<boolean> {
  const d = state.doc;
  if (!d) return false;
  if (!d.path) return saveAs();
  try {
    const text = d.text;
    await native.saveDocument(d.path, text);
    d.saved = text;
    notify(t("Saved"), "ok");
    return true;
  } catch (e) {
    notify(t("Could not save: {0}", String(e)), "bad");
    return false;
  }
}

export async function saveAs(): Promise<boolean> {
  const d = state.doc;
  if (!d) return false;
  try {
    const o = await native.saveDialog(d.name, d.text);
    if (!o) return false;
    d.path = o.path;
    d.name = o.name;
    d.saved = o.text;
    notify(t("Saved"), "ok");
    void refreshRecent();
    void verifyNow(true);
    return true;
  } catch (e) {
    notify(t("Could not save: {0}", String(e)), "bad");
    return false;
  }
}

let revealSeq = 0;

export function revealLine(line: number) {
  state.sheet = null;
  state.mode = "edit";
  state.reveal = { line, seq: ++revealSeq };
}
