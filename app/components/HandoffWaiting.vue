<script setup lang="ts">
import { computed } from "vue";
import { cancelHandoff, waiting } from "../services/handoff.ts";
import { tr } from "../services/lang.ts";

const host = computed(() => waiting.current?.host ?? "");
</script>

<template>
  <div v-if="waiting.current" class="modal-back">
    <div class="modal" role="dialog" aria-modal="true" aria-live="polite">
      <p><b>{{ waiting.current.op === "key" ? tr("Choose a passkey in the browser") : tr("Sign with your passkey in the browser") }}</b></p>
      <p class="hint">{{ tr("The signing page on {0} opened in your browser. When you finish there, you come back here automatically.", host) }}</p>
      <p v-if="waiting.current.userVerification" class="hint">{{ tr("This document asks for user verification: unlock the passkey with your fingerprint, face, or PIN.") }}</p>
      <div class="row"><button type="button" @click="cancelHandoff()">{{ tr("Cancel") }}</button></div>
    </div>
  </div>
</template>
