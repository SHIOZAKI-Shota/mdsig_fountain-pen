<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { state, dirty, openPath, refreshRecent, openDialog, newDocument, save, saveAs } from "./services/doc.ts";
import { composing } from "./services/keys-ime.ts";
import { dialog } from "./services/dialog.ts";
import { loadSettings } from "./services/settings.ts";
import { applyLang, tr } from "./services/lang.ts";
import { applyTheme, watchSystemTheme } from "./services/theme.ts";
import { confirmDialog } from "./services/dialog.ts";
import { isTauri, native } from "./services/native.ts";
import { handleHandoffUrl } from "./services/handoff.ts";

const unlisten: (() => void)[] = [];

function editable(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  return !!el?.closest("input, textarea, [contenteditable='true'], .cm-content");
}

function onContextMenu(e: MouseEvent) {
  if (e.defaultPrevented || editable(e.target) || (getSelection()?.toString() ?? "") !== "") return;
  e.preventDefault();
}

async function onShortcut(e: KeyboardEvent) {
  if (composing(e) || dialog.current || !(e.metaKey || e.ctrlKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "s" && state.doc) {
    e.preventDefault();
    await (e.shiftKey ? saveAs() : save());
  } else if (k === "o" && !e.shiftKey) {
    e.preventDefault();
    if (!dirty() || (await confirmDialog(tr("Discard the unsaved changes to {0}?", state.doc!.name), tr("Discard"), tr("Cancel"), true))) await openDialog();
  } else if (k === "n" && !e.shiftKey) {
    e.preventDefault();
    if (!dirty() || (await confirmDialog(tr("Discard the unsaved changes to {0}?", state.doc!.name), tr("Discard"), tr("Cancel"), true))) newDocument();
  }
}

async function openQueued(paths: string[]) {
  const p = paths.at(-1);
  if (!p) return;
  if (dirty() && !(await confirmDialog(tr("Discard the unsaved changes to {0}?", state.doc!.name), tr("Discard"), tr("Cancel"), true))) return;
  await openPath(p);
}

onMounted(async () => {
  document.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onShortcut);
  unlisten.push(() => document.removeEventListener("contextmenu", onContextMenu), () => window.removeEventListener("keydown", onShortcut));
  watchSystemTheme();
  applyTheme();
  if (!isTauri()) return;
  await loadSettings();
  applyLang();
  applyTheme();
  await refreshRecent();
  unlisten.push(await listen<string[]>("open-files", () => void native.takePending().then(openQueued)));
  unlisten.push(await listen<string>("handoff", (e) => void handleHandoffUrl(e.payload)));
  await openQueued(await native.takePending());
  const win = getCurrentWindow();
  unlisten.push(
    await win.onCloseRequested(async (ev) => {
      if (!dirty()) return;
      ev.preventDefault();
      if (await confirmDialog(tr("Quit without saving {0}?", state.doc!.name), tr("Quit"), tr("Cancel"), true)) await win.destroy();
    }),
  );
});

onBeforeUnmount(() => unlisten.forEach((f) => f()));
</script>

<template>
  <div class="app">
    <TopBar />
    <StartScreen v-if="!state.doc" />
    <div v-else class="work">
      <main class="main">
        <PreviewPane v-if="state.mode === 'preview'" />
        <StatusView v-else-if="state.mode === 'status'" />
        <EditorPane v-else />
        <SignSheet v-if="state.sheet === 'sign'" />
        <SetupSheet v-if="state.sheet === 'setup'" />
        <KeysSheet v-if="state.sheet === 'keys'" />
        <SettingsSheet v-if="state.sheet === 'settings'" />
      </main>
      <SidePanel />
    </div>
    <div v-if="!state.doc && state.sheet" class="sheet-full">
      <SetupSheet v-if="state.sheet === 'setup'" />
      <KeysSheet v-if="state.sheet === 'keys'" />
      <SettingsSheet v-if="state.sheet === 'settings'" />
    </div>
    <p v-if="state.notice" class="toast" :class="`t-${state.notice.tone}`" role="status">{{ state.notice.text }}</p>
    <HandoffWaiting />
    <DialogHost />
  </div>
</template>
