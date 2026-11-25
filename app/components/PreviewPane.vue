<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { state } from "../services/doc.ts";
import { lang } from "../services/lang.ts";
import { settings } from "../services/settings.ts";
import { renderPreview } from "../services/preview.ts";

const host = ref<HTMLElement>();

function render() {
  if (!host.value || !state.doc) return;
  host.value.replaceChildren(renderPreview(state.doc.text, state.entry, settings.showHidden));
}

function click(ev: MouseEvent) {
  const a = (ev.target as HTMLElement).closest("a");
  if (!a) return;
  ev.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^https:\/\//i.test(href)) void openUrl(href);
}

onMounted(render);
watch(() => [state.doc?.text, state.entry, settings.showHidden, lang.value], render);
</script>

<template>
  <div class="page" @click="click"><div ref="host" /></div>
</template>
