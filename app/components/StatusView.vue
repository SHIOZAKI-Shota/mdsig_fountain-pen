<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { buildModel } from "../lib/model.ts";
import { t } from "../lib/i18n.ts";
import { state, verifyNow } from "../services/doc.ts";
import { tr, lang } from "../services/lang.ts";
import { settings } from "../services/settings.ts";
import { confirmDialog } from "../services/dialog.ts";
import { figure, hue } from "../services/figure.ts";
import { composing } from "../services/keys-ime.ts";

type Tab = "signatures" | "ranges" | "agreement" | "table";

const model = computed(() => {
  void lang.value;
  return state.entry ? buildModel(t, state.entry, settings.fullText) : null;
});
const tabs = computed<[Tab, string][]>(() => {
  const m = model.value;
  if (!m) return [];
  const out: [Tab, string][] = [];
  if (m.cards.length) out.push(["signatures", tr("Signatures")]);
  out.push(["ranges", tr("Ranges")]);
  if (m.agreement.length) out.push(["agreement", tr("Required")]);
  if (m.table) out.push(["table", tr("Table")]);
  return out;
});
const current = ref<Tab>("signatures");
const active = computed<Tab>(() => (tabs.value.some(([id]) => id === current.value) ? current.value : (tabs.value[0]?.[0] ?? "ranges")));
const figHost = ref<HTMLElement>();

watch([model, active, figHost], async () => {
  await nextTick();
  if (figHost.value && model.value) figHost.value.replaceChildren(figure(model.value));
});

function key(ev: KeyboardEvent, i: number) {
  if (composing(ev)) return;
  const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
  if (!d) return;
  const next = tabs.value[(i + d + tabs.value.length) % tabs.value.length]![0];
  current.value = next;
  nextTick(() => document.querySelector<HTMLButtonElement>(`.tab[data-tab="${next}"]`)?.focus());
}

async function accept() {
  if (await confirmDialog(tr("Accept the new key for this signer? Do this only if you know the signer changed their key."), tr("Accept the new key"), tr("Cancel"), true)) await verifyNow(true, true);
}
</script>

<template>
  <div class="page">
    <p v-if="!model" class="empty">{{ tr("Checking…") }}</p>
    <template v-else>
      <div class="tabs" role="tablist">
        <button v-for="([id, label], i) in tabs" :key="id" type="button" class="tab" role="tab" :data-tab="id" :aria-selected="active === id" :tabindex="active === id ? 0 : -1" @click="current = id" @keydown="key($event, i)">{{ label }}</button>
      </div>
      <div role="tabpanel">
        <ul v-if="active === 'signatures'" class="sigs">
          <li v-for="c in model.cards" :key="c.index" :class="hue(c.index, c.tone)">
            <div class="sig-top">
              <span class="idx">#{{ c.index }}</span>
              <span v-if="c.name" class="declared">{{ c.name }}</span>
              <span class="signer">{{ c.signer }}</span>
              <span v-if="c.role" class="badge">{{ c.role }}</span>
              <span class="status">{{ c.mark }} {{ c.status }}</span>
            </div>
            <div class="meta">{{ c.method }}</div>
            <dl v-if="c.rows.length">
              <template v-for="[k, v] in c.rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
            </dl>
            <NewKeys :signer="c.signer" compact />
            <div v-if="c.keyChanged" class="sig-actions"><button type="button" class="link" @click="accept()">{{ tr("Accept the new key") }}</button></div>
          </li>
        </ul>
        <div v-else-if="active === 'ranges'" ref="figHost" />
        <ul v-else-if="active === 'agreement'" class="sigs">
          <li v-for="(d, k) in model.agreement" :key="k">
            <div class="sig-top">
              <span class="signer">{{ d.title }}</span>
              <span class="status" :class="`t-${d.tone}`">{{ d.status }}</span>
            </div>
            <div v-for="(n, j) in d.notes" :key="j" class="meta">{{ n }}</div>
            <ul class="steps">
              <template v-for="(st, i) in d.steps" :key="i">
                <li v-if="st.label" class="step" :class="{ done: st.done }">{{ st.done ? "✓" : "…" }} {{ st.label }}</li>
                <li v-for="(mem, j) in st.members" :key="j" :class="{ done: mem.done }">
                  {{ mem.done ? "✓" : "○" }} {{ mem.text }}
                  <span v-for="(n, x) in mem.notes" :key="x" class="step-note">{{ n }}</span>
                </li>
              </template>
            </ul>
          </li>
        </ul>
        <div v-else class="sig-table">
          <p class="note">{{ tr("The signature table this document asks for, built from the verification result. It is not part of the signed text.") }}</p>
          <table>
            <thead><tr><th>#</th><th>{{ tr("Signer") }}</th><th>{{ tr("Method") }}</th><th>{{ tr("Role") }}</th><th>{{ tr("Timestamp") }}</th><th>{{ tr("Status") }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in model.table ?? []" :key="i">
                <td class="idx">{{ r.number }}</td>
                <td><span v-if="r.name" class="declared">{{ r.name }}</span><span class="signer">{{ r.signer }}</span></td>
                <td>{{ r.method }}</td>
                <td>{{ r.role }}</td>
                <td class="mono">{{ r.time }}</td>
                <td :class="`t-${r.tone}`">{{ r.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
