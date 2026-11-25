<script setup lang="ts">
import { computed } from "vue";
import { mark, signerLabel, statusText, summarize, summaryText, summaryTone, tone } from "../lib/present.ts";
import { t } from "../lib/i18n.ts";
import { state, dirty, save, setText, verifyNow, notify } from "../services/doc.ts";
import { tr, lang } from "../services/lang.ts";
import { settings } from "../services/settings.ts";
import { confirmDialog } from "../services/dialog.ts";
import { timestampText } from "../services/sign.ts";
import { hue } from "../services/figure.ts";

const seal = computed(() => {
  void lang.value;
  const e = state.entry;
  if (!e) return { tone: "muted", mark: "…", title: tr("Checking…"), detail: "" };
  const k = summarize(e.result);
  const s = summaryText(t, e.result);
  return { tone: summaryTone(k), mark: k === "verified" ? "✓" : k === "pending" ? "…" : k === "offline" || k === "unsigned" ? "−" : k === "incomplete" ? "?" : "✗", ...s };
});
const sigs = computed(() => {
  void lang.value;
  return (state.entry?.result.signatures ?? []).map((s) => ({ index: s.index, tone: tone(s), mark: mark(s), who: signerLabel(s), role: s.fields.role, status: statusText(t, s) }));
});
const signed = computed(() => (state.entry?.result.signatures.length ?? 0) > 0);
const missing = computed(() => state.entry?.result.agreement.missing ?? []);

async function addTimestamp() {
  const d = state.doc;
  if (!d) return;
  if (!(await confirmDialog(tr("Add a timestamp from {0}? It records that the document and its signatures existed at this time.", settings.tsaUrl), tr("Add timestamp"), tr("Cancel")))) return;
  try {
    notify(tr("Requesting a timestamp…"));
    setText(await timestampText(d.text, settings.tsaUrl), { online: true });
    notify(tr("Timestamp added. Save the file to keep it."), "ok");
  } catch (e) {
    notify(String((e as Error).message ?? e), "bad");
  }
}
</script>

<template>
  <aside class="side">
    <div class="summary" :class="`t-${seal.tone}`" aria-live="polite">
      <span class="icon">{{ seal.mark }}</span>
      <div>{{ seal.title }}<span v-if="seal.detail" class="sub">{{ seal.detail }}</span></div>
    </div>
    <p v-if="state.entry && !state.entry.online" class="note">{{ settings.network ? tr("Checked without the network while editing. The signers' keys are checked when you save or press Verify again.") : tr("Network checks are turned off in Settings, so the signers' keys were not checked.") }}</p>
    <NewKeys />
    <FindingsList />
    <div class="actions">
      <button type="button" class="primary big" @click="state.sheet = 'sign'">{{ signed ? tr("Add my signature") : tr("Sign this document") }}</button>
      <button v-if="dirty() || !state.doc?.path" type="button" @click="save()">{{ tr("Save") }}</button>
      <button v-if="signed" type="button" @click="addTimestamp()">{{ tr("Add timestamp") }}</button>
      <button type="button" :disabled="state.verifying" @click="verifyNow(true)">{{ state.verifying ? tr("Checking…") : tr("Verify again") }}</button>
    </div>
    <template v-if="sigs.length">
      <h3>{{ tr("Signatures") }}</h3>
      <ul class="minisigs">
        <li v-for="s in sigs" :key="s.index" :class="hue(s.index, s.tone)">
          <span class="mk">{{ s.mark }}</span>
          <span class="who">#{{ s.index }} {{ s.who }}<span v-if="s.role"> · {{ s.role }}</span></span>
          <span class="st">{{ s.status }}</span>
        </li>
      </ul>
    </template>
    <template v-if="missing.length">
      <h3>{{ tr("Still needed") }}</h3>
      <ul class="minisigs">
        <li v-for="(m, i) in missing" :key="i" class="t-warn">
          <span class="mk">○</span>
          <span class="who">{{ m.signer }}<span v-if="m.role"> · {{ m.role }}</span></span>
        </li>
      </ul>
    </template>
  </aside>
</template>
