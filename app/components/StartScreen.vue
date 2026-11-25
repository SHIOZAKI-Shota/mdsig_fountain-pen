<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { state, newDocument, openDialog, openPath } from "../services/doc.ts";
import { tr } from "../services/lang.ts";
import { isTauri } from "../services/native.ts";

const over = ref(false);
let unlisten: (() => void) | undefined;

onMounted(async () => {
  if (!isTauri()) return;
  unlisten = await getCurrentWebview().onDragDropEvent((e) => {
    over.value = e.payload.type === "enter" || e.payload.type === "over";
  });
});
onBeforeUnmount(() => unlisten?.());

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
</script>

<template>
  <div class="start">
    <div class="start-inner">
      <h1>{{ tr("Sign and check Markdown documents") }}</h1>
      <p class="lead">{{ tr("Open the document you were asked to sign. Its signatures are checked as soon as it opens.") }}</p>
      <div class="drop" :class="{ over }">
        <span>{{ tr("Drop a .md file here") }}</span>
        <div class="row">
          <button type="button" class="primary" @click="openDialog()">{{ tr("Open a file") }}</button>
          <button type="button" @click="newDocument()">{{ tr("New document") }}</button>
        </div>
      </div>
      <section v-if="state.recent.length" class="recent">
        <h2>{{ tr("Recent files") }}</h2>
        <ul>
          <li v-for="p in state.recent" :key="p">
            <button type="button" @click="openPath(p)">
              <span class="rn">{{ base(p) }}</span>
              <span class="rp">{{ p }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
