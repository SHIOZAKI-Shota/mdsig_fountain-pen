<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { dialog, closeDialog } from "../services/dialog.ts";
import { composing } from "../services/keys-ime.ts";

const input = ref<HTMLInputElement>();
const okBtn = ref<HTMLButtonElement>();

watch(
  () => dialog.current,
  async (c) => {
    if (!c) return;
    await nextTick();
    (c.input ? input.value : okBtn.value)?.focus();
  },
);

function onKey(e: KeyboardEvent) {
  if (composing(e)) return;
  if (e.key === "Escape") closeDialog(null);
}

function onEnter(e: KeyboardEvent) {
  if (!composing(e)) ok();
}

function ok() {
  const c = dialog.current;
  if (!c) return;
  closeDialog(c.input ? c.input.value : true);
}
</script>

<template>
  <div v-if="dialog.current" class="modal-back" @keydown="onKey">
    <div class="modal" role="dialog" aria-modal="true">
      <p>{{ dialog.current.text }}</p>
      <input v-if="dialog.current.input" ref="input" v-model="dialog.current.input.value" :type="dialog.current.input.password ? 'password' : 'text'" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" @keydown.enter="onEnter" />
      <div class="row">
        <button type="button" @click="closeDialog(null)">{{ dialog.current.cancel }}</button>
        <button ref="okBtn" type="button" class="primary" @click="ok()">{{ dialog.current.ok }}</button>
      </div>
    </div>
  </div>
</template>
