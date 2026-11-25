<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { state, dirty, save, closeDocument, type Mode } from "../services/doc.ts";
import { tr } from "../services/lang.ts";
import { confirmDialog } from "../services/dialog.ts";
import { dark, toggleTheme } from "../services/theme.ts";
import { isTauri } from "../services/native.ts";
import { platform } from "../services/platform.ts";

const os = platform();
const maximized = ref(false);
let unlisten: (() => void) | undefined;

const modes: [Mode, string][] = [
  ["preview", "Preview"],
  ["status", "Signature status"],
  ["edit", "Edit"],
];

onMounted(async () => {
  if (!isTauri() || os !== "win") return;
  const w = getCurrentWindow();
  maximized.value = await w.isMaximized().catch(() => false);
  unlisten = await w.onResized(async () => {
    maximized.value = await w.isMaximized().catch(() => false);
  });
});
onBeforeUnmount(() => unlisten?.());

function setMode(m: Mode) {
  state.sheet = null;
  state.mode = m;
}

async function close() {
  if (dirty() && !(await confirmDialog(tr("Discard the unsaved changes to {0}?", state.doc!.name), tr("Discard"), tr("Cancel"), true))) return;
  closeDocument();
}

function toggle(s: "settings" | "keys") {
  state.sheet = state.sheet === s ? null : s;
}

const win = () => getCurrentWindow();
</script>

<template>
  <header class="top" :class="`os-${os}`" data-tauri-drag-region @dblclick.self="os === 'win' && win().toggleMaximize()">
    <div class="brand" data-tauri-drag-region><img src="/logo.svg" alt="" data-tauri-drag-region />Fountain Pen</div>
    <div v-if="state.doc" class="docname" data-tauri-drag-region>
      <b :title="state.doc.path ?? ''" data-tauri-drag-region>{{ state.doc.name }}</b>
      <span v-if="dirty()" class="dot" :title="tr('Not saved')">●</span>
    </div>
    <div class="spacer" data-tauri-drag-region />
    <div v-if="state.doc" class="seg" role="group">
      <button v-for="[id, label] in modes" :key="id" type="button" :aria-pressed="state.mode === id && !state.sheet" @click="setMode(id)">{{ tr(label) }}</button>
    </div>
    <div class="spacer" data-tauri-drag-region />
    <div class="top-actions">
      <template v-if="state.doc">
        <button type="button" class="quiet" :disabled="!dirty() && !!state.doc.path" @click="save()">{{ tr("Save") }}</button>
        <button type="button" class="quiet" @click="close()">{{ tr("Close") }}</button>
      </template>
      <button type="button" class="quiet" :aria-pressed="state.sheet === 'keys'" @click="toggle('keys')">{{ tr("Keys") }}</button>
      <button type="button" class="quiet" :aria-pressed="state.sheet === 'settings'" @click="toggle('settings')">{{ tr("Settings") }}</button>
      <button type="button" class="quiet icon" :title="dark ? tr('Switch to light mode') : tr('Switch to dark mode')" :aria-label="dark ? tr('Switch to light mode') : tr('Switch to dark mode')" @click="toggleTheme()">
        <svg v-if="dark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
      </button>
    </div>
    <div v-if="os === 'win'" class="winctl">
      <button type="button" :aria-label="tr('Minimize')" @click="win().minimize()"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg></button>
      <button type="button" :aria-label="maximized ? tr('Restore') : tr('Maximize')" @click="win().toggleMaximize()">
        <svg v-if="maximized" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" /></svg>
        <svg v-else viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
      </button>
      <button type="button" class="close" :aria-label="tr('Close window')" @click="win().close()"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg></button>
    </div>
  </header>
</template>
