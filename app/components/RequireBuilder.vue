<script setup lang="ts">
import { ref, watch } from "vue";
import { parseRequire } from "@mdsig/core";
import { REQUIRE_METHODS, draftFromSpec, emptyDraft, emptyLine, serializeDraft, type Draft, type DraftStep } from "../lib/requireDraft.ts";
import { tr } from "../services/lang.ts";

const model = defineModel<string>({ required: true });

const METHOD_LABEL: Record<string, string> = { dns: "Company or personal domain", "git-hosting": "GitHub or GitLab account", directory: "Email address", pgp: "OpenPGP key", tofu: "This key only" };
const ORDER_LABEL: Record<string, string> = { pending: "Signatures before their turn wait (default)", guide: "Signatures before their turn count but are reported", strict: "A signature before its turn fails the document" };

const draft = ref<Draft>(emptyDraft());
const usable = ref(true);
let emitted = "";

function fromText(v: string) {
  if (v === emitted) return;
  if (!v.trim()) {
    draft.value = emptyDraft();
    usable.value = true;
    return;
  }
  const p = parseRequire(v, 0);
  usable.value = p.errors.length === 0 && p.unsupported.length === 0 && !p.overLimit && p.hints.length === 0;
  if (usable.value) draft.value = draftFromSpec(p.spec);
}

watch(model, fromText, { immediate: true });

function emit() {
  emitted = serializeDraft(draft.value);
  model.value = emitted;
}

function removeLine(st: DraftStep, i: number) {
  st.lines.splice(i, 1);
  if (!st.lines.length) st.lines.push(emptyLine());
  emit();
}

function removeStep(i: number) {
  draft.value.steps.splice(i, 1);
  if (!draft.value.steps.length) draft.value = emptyDraft();
  emit();
}
</script>

<template>
  <div class="builder">
    <p v-if="!usable" class="hint">{{ tr("This value cannot be shown in the form. Fix it as text first.") }}</p>
    <template v-else>
      <div class="field">
        <label for="req-order">{{ tr("Order") }}</label>
        <select id="req-order" v-model="draft.order" @change="emit()">
          <option v-for="o in ['pending', 'guide', 'strict']" :key="o" :value="o">{{ tr(ORDER_LABEL[o]!) }}</option>
        </select>
      </div>
      <fieldset v-for="(st, k) in draft.steps" :key="k" class="b-step">
        <legend>{{ tr("Step {0}", k + 1) }}</legend>
        <div class="field">
          <label :for="`req-any-${k}`">{{ tr("How many are needed (blank = all)") }}</label>
          <input :id="`req-any-${k}`" v-model="st.any" type="text" inputmode="numeric" autocomplete="off" @input="st.any = st.any.replace(/[^0-9]/g, ''); emit()" />
        </div>
        <div v-for="(l, i) in st.lines" :key="i" class="b-line">
          <select v-model="l.method" :aria-label="tr('Sign as')" @change="emit()">
            <option v-for="m in REQUIRE_METHODS" :key="m" :value="m">{{ tr(METHOD_LABEL[m]!) }}</option>
          </select>
          <input v-model="l.signer" type="text" :placeholder="tr('Signer or pattern (e.g. example.com, *.example.com, *)')" :aria-label="tr('Signer or pattern (e.g. example.com, *.example.com, *)')" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" @input="emit()" />
          <input v-model="l.role" type="text" :placeholder="tr('Role')" :aria-label="tr('Role')" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" @input="emit()" />
          <input v-model="l.memberOf" type="text" :placeholder="tr('Member of (https URL or dns:domain)')" :aria-label="tr('Member of (https URL or dns:domain)')" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" @input="emit()" />
          <input v-if="l.method === 'tofu'" v-model="l.pubkey" type="text" :placeholder="tr('Public key (tofu: ed25519:…)')" :aria-label="tr('Public key (tofu: ed25519:…)')" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" @input="emit()" />
          <label class="check"><input v-model="l.userVerified" type="checkbox" @change="emit()" />{{ tr("Require user verification (passkey)") }}</label>
          <button type="button" class="link" @click="removeLine(st, i)">{{ tr("Remove") }}</button>
        </div>
        <div class="row">
          <button type="button" @click="st.lines.push(emptyLine())">{{ tr("Add a signer") }}</button>
          <button type="button" class="link" @click="removeStep(k)">{{ tr("Remove") }}</button>
        </div>
      </fieldset>
      <div class="row"><button type="button" @click="draft.steps.push({ any: '', lines: [emptyLine()] })">{{ tr("Add a step") }}</button></div>
    </template>
  </div>
</template>
