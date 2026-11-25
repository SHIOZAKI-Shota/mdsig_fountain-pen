<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { state, setText, notify } from "../services/doc.ts";
import { tr, lang } from "../services/lang.ts";
import { settings } from "../services/settings.ts";
import { askDialog } from "../services/dialog.ts";
import { editorExtensions, external, lockField } from "../services/editor.ts";
import { renderPreview } from "../services/preview.ts";
import { planSection, suggestSectionId, type SectionError } from "../lib/sections.ts";
import { touches } from "../lib/locks.ts";
import { composing } from "../services/keys-ime.ts";

const host = ref<HTMLElement>();
const previewHost = ref<HTMLElement>();
const view = shallowRef<EditorView>();
const kind = ref<"free" | "scoped" | "full">("free");
const hasSelection = ref(false);
const selectionLocked = ref(false);
const menu = ref<null | { x: number; y: number }>(null);

function refreshKind() {
  if (view.value) kind.value = view.value.state.field(lockField).locks.kind;
}

function refreshSelection() {
  const v = view.value;
  if (!v) return;
  const sel = v.state.selection.main;
  hasSelection.value = !sel.empty;
  selectionLocked.value = touches(v.state.field(lockField).spans, sel.from, sel.to);
}

let lastBlocked = 0;
function blocked() {
  if (Date.now() - lastBlocked < 2500) return;
  lastBlocked = Date.now();
  notify(kind.value === "full" ? tr("This document is signed as a whole, so it cannot be edited.") : tr("Signed sections and signatures cannot be edited."));
}

onMounted(() => {
  const text = state.doc?.text ?? "";
  view.value = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: text,
      extensions: [
        editorExtensions(
          text,
          (t) => {
            setText(t);
            refreshKind();
          },
          blocked,
        ),
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) refreshSelection();
        }),
      ],
    }),
  });
  refreshKind();
  if (import.meta.dev) (window as unknown as { __fpEditor?: EditorView }).__fpEditor = view.value;
  if (state.reveal) reveal();
  else if (kind.value !== "full") view.value.focus();
  window.addEventListener("keydown", closeMenuOnKey);
});

function reveal() {
  const v = view.value;
  const r = state.reveal;
  if (!v || !r) return;
  const line = v.state.doc.line(Math.min(Math.max(r.line, 1), v.state.doc.lines));
  v.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
  v.focus();
}

onBeforeUnmount(() => {
  view.value?.destroy();
  window.removeEventListener("keydown", closeMenuOnKey);
});
watch(() => state.reveal?.seq, reveal);

watch(
  () => state.doc?.text,
  (text) => {
    const v = view.value;
    if (!v || text === undefined || text === v.state.doc.toString()) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, annotations: external.of(true) });
    refreshKind();
  },
);

function renderSide() {
  if (previewHost.value && state.doc) previewHost.value.replaceChildren(renderPreview(state.doc.text, state.entry, settings.showHidden));
}
watch(() => [state.doc?.text, state.entry, settings.showHidden, lang.value, previewHost.value], renderSide);

const banner = computed(() => {
  void lang.value;
  if (kind.value === "full") return { tone: "muted", text: tr("This document is signed as a whole. Any change would invalidate the signatures, so it is read-only.") };
  if (kind.value === "scoped") return { tone: "muted", text: tr("Shaded lines are signed sections or signatures and cannot be edited. You can edit the rest.") };
  return null;
});

const canSection = computed(() => kind.value !== "full" && hasSelection.value && !selectionLocked.value);

const SECTION_ERRORS: Record<SectionError, string> = {
  "bad-id": "Use only lower-case letters, digits, and hyphens for the section ID.",
  "duplicate-id": "A section with this ID already exists.",
  overlap: "The selection overlaps another section or a code block. Sections cannot be nested.",
  "signature-area": "Signature blocks cannot be part of a section.",
  empty: "The selection has no text.",
};

async function makeSection(andSign: boolean) {
  menu.value = null;
  const v = view.value;
  if (!v) return;
  if (kind.value === "full") return void notify(tr("This document is signed as a whole, so it cannot be edited."));
  const sel = v.state.selection.main;
  if (sel.empty) return void notify(tr("Select the text to sign first."));
  const doc = v.state.doc;
  const fromLine = doc.lineAt(sel.from).number;
  let toLine = doc.lineAt(sel.to).number;
  if (toLine > fromLine && doc.line(toLine).from === sel.to) toLine--;
  const text = doc.toString();
  const id = await askDialog(tr("Section ID (lower-case letters, digits, and hyphens). It is shown to signers and readers."), andSign ? tr("Next") : tr("Create"), tr("Cancel"), false, suggestSectionId(text, fromLine, toLine));
  if (id === null) return;
  const plan = planSection(text, fromLine, toLine, id.trim(), v.state.lineBreak);
  if ("error" in plan) return void notify(tr(SECTION_ERRORS[plan.error]), "bad");
  const before = v.state.doc.length;
  v.dispatch({
    changes: [
      { from: doc.line(fromLine).from, insert: plan.open + v.state.lineBreak },
      { from: doc.line(toLine).to, insert: v.state.lineBreak + plan.close },
    ],
    selection: { anchor: doc.line(fromLine).from },
  });
  if (v.state.doc.length === before) return void notify(tr("Signed sections and signatures cannot be edited."), "bad");
  if (andSign) {
    state.signScope = [id.trim()];
    state.sheet = "sign";
  } else {
    notify(tr("Section \"{0}\" created. Signatures can now cover it alone.", id.trim()), "ok");
  }
}

function openMenu(ev: MouseEvent) {
  ev.preventDefault();
  refreshSelection();
  const w = 260;
  const h = 260;
  menu.value = { x: Math.min(ev.clientX, window.innerWidth - w - 8), y: Math.min(ev.clientY, window.innerHeight - h - 8) };
}

function closeMenuOnKey(ev: KeyboardEvent) {
  if (ev.key === "Escape" && !composing(ev)) menu.value = null;
}

async function copy(cut: boolean) {
  menu.value = null;
  const v = view.value;
  if (!v) return;
  const sel = v.state.selection.main;
  const text = v.state.sliceDoc(sel.from, sel.to);
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
  }
  if (cut) v.dispatch({ changes: { from: sel.from, to: sel.to } });
  v.focus();
}

async function paste() {
  menu.value = null;
  const v = view.value;
  if (!v) return;
  let text = "";
  try {
    text = await readText();
  } catch {
    text = (await navigator.clipboard?.readText().catch(() => "")) ?? "";
  }
  if (text) v.dispatch(v.state.replaceSelection(text));
  v.focus();
}

function selectAll() {
  menu.value = null;
  const v = view.value;
  if (!v) return;
  v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
  v.focus();
}
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-col">
      <div class="editor-head">
        <p v-if="banner" class="banner" :class="`t-${banner.tone}`">{{ banner.text }}</p>
        <div v-if="kind !== 'full'" class="editor-tools">
          <button type="button" class="primary small" :disabled="!canSection" @click="makeSection(true)">{{ tr("Sign the selection as a section") }}</button>
          <button type="button" class="small" :disabled="!canSection" @click="makeSection(false)">{{ tr("Make a section") }}</button>
          <span class="hint">{{ canSection ? "" : selectionLocked ? tr("The selection includes signed text.") : tr("Select lines to sign only that part. Right-click also works.") }}</span>
        </div>
      </div>
      <div ref="host" class="editor-host" @contextmenu="openMenu" />
    </div>
    <div class="editor-preview"><div class="page"><div ref="previewHost" /></div></div>
    <div v-if="menu" class="ctx-back" @mousedown.self="menu = null" @contextmenu.prevent="menu = null">
      <ul class="ctx" role="menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
        <li><button type="button" role="menuitem" :disabled="!canSection" @click="makeSection(true)">{{ tr("Sign the selection as a section") }}…</button></li>
        <li><button type="button" role="menuitem" :disabled="!canSection" @click="makeSection(false)">{{ tr("Make a section") }}…</button></li>
        <li class="sep" role="separator" />
        <li><button type="button" role="menuitem" :disabled="!hasSelection || selectionLocked || kind === 'full'" @click="copy(true)">{{ tr("Cut") }}</button></li>
        <li><button type="button" role="menuitem" :disabled="!hasSelection" @click="copy(false)">{{ tr("Copy") }}</button></li>
        <li><button type="button" role="menuitem" :disabled="kind === 'full' || selectionLocked" @click="paste()">{{ tr("Paste") }}</button></li>
        <li><button type="button" role="menuitem" @click="selectAll()">{{ tr("Select all") }}</button></li>
      </ul>
    </div>
  </div>
</template>
