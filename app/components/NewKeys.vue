<script setup lang="ts">
import { computed } from "vue";
import { state, verifyNow, notify } from "../services/doc.ts";
import { tr } from "../services/lang.ts";
import { confirmDialog } from "../services/dialog.ts";
import { trustKey } from "../services/verify.ts";
import type { NewKey } from "../lib/entry.ts";

const props = defineProps<{ signer?: string; compact?: boolean }>();
const keys = computed(() => (state.entry?.newKeys ?? []).filter((k) => !props.signer || k.signer === props.signer));

async function trust(k: NewKey) {
  const ok = await confirmDialog(tr("Trust this key for {0}?\n{1}\nCheck the fingerprint with the signer through another channel if you can. Later documents from {0} with a different key will be reported.", k.signer, k.fingerprint), tr("Trust"), tr("Cancel"));
  if (!ok) return;
  await trustKey(k.signer, k.key);
  notify(tr("Trusted the key of {0}", k.signer), "ok");
  await verifyNow(true);
}
</script>

<template>
  <section v-if="keys.length" class="newkeys" :class="{ compact }">
    <h3 v-if="!compact">{{ tr("Keys seen for the first time") }}</h3>
    <p v-if="!compact" class="note">{{ tr("These signatures are valid, but the keys are not in your trusted list. Like accepting a new SSH host, trust a key only if the fingerprint is what the signer told you.") }}</p>
    <ul>
      <li v-for="k in keys" :key="k.signer + k.key">
        <span class="who"><b v-if="!compact">{{ k.signer }}</b><span v-else>{{ tr("Key seen for the first time") }}</span><code>{{ k.fingerprint }}</code></span>
        <button type="button" class="small" @click="trust(k)">{{ tr("Trust") }}</button>
      </li>
    </ul>
  </section>
</template>
