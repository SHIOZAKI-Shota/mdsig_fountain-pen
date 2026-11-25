<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { readTsaRoots } from "@mdsig/core";
import { state, verifyNow } from "../services/doc.ts";
import { tr, applyLang } from "../services/lang.ts";
import { settings, saveSettings } from "../services/settings.ts";
import { applyTheme } from "../services/theme.ts";
import { DEFAULT_KEY_DIRECTORIES, addKeyDirectory, addSigningPage, removeKeyDirectory, removeSigningPage, signingPages, storedKeyDirectories, type SigningPage } from "../services/directories.ts";

const stored = ref<string[]>([]);
const pages = ref<SigningPage[]>([]);
const newDir = ref("");
const newPage = ref("");
const listError = ref("");

async function loadLists() {
  stored.value = await storedKeyDirectories();
  pages.value = await signingPages();
}
onMounted(loadLists);

async function run(f: () => Promise<void>) {
  listError.value = "";
  try {
    await f();
    await loadLists();
  } catch (e) {
    listError.value = String((e as Error).message) === "https" ? tr("Enter an https:// URL.") : String((e as Error).message ?? e);
  }
}
const rootText = ref("");
const rootError = ref("");

watch(
  () => ({ ...settings, tsaRoots: [...settings.tsaRoots], signingPages: [...settings.signingPages] }),
  async (now, before) => {
    await saveSettings();
    if (now.lang !== before.lang) applyLang();
    if (now.theme !== before.theme) applyTheme();
    if (now.network !== before.network || now.checkRevocation !== before.checkRevocation || now.fetchResources !== before.fetchResources || now.keyserver !== before.keyserver) void verifyNow(true);
  },
  { deep: true },
);


async function addRoot() {
  rootError.value = "";
  try {
    const info = await readTsaRoots(rootText.value);
    if (!info.length) throw new Error(tr("No certificate was found."));
    settings.tsaRoots = [...settings.tsaRoots, rootText.value.trim()];
    rootText.value = "";
  } catch (e) {
    rootError.value = String((e as Error).message ?? e);
  }
}
</script>

<template>
  <section class="sheet">
    <div class="page form">
      <div class="sheet-head">
        <h1>{{ tr("Settings") }}</h1>
        <div class="spacer" />
        <button type="button" class="quiet" @click="state.sheet = null">{{ tr("Close") }}</button>
      </div>
      <p class="lead">{{ tr("Changes are saved immediately.") }}</p>

      <div class="field">
        <label for="lang">{{ tr("Language") }}</label>
        <select id="lang" v-model="settings.lang">
          <option value="auto">{{ tr("Same as the system") }}</option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>

      <div class="field">
        <label for="theme">{{ tr("Appearance") }}</label>
        <select id="theme" v-model="settings.theme">
          <option value="system">{{ tr("Same as the system") }}</option>
          <option value="light">{{ tr("Light") }}</option>
          <option value="dark">{{ tr("Dark") }}</option>
        </select>
      </div>

      <fieldset>
        <legend>{{ tr("Verification") }}</legend>
        <label class="check"><input v-model="settings.network" type="checkbox" />{{ tr("Use the network to check the signers' keys") }}</label>
        <label class="check"><input v-model="settings.checkRevocation" type="checkbox" :disabled="!settings.network" />{{ tr("Check whether signers withdrew their signatures") }}</label>
        <label class="check"><input v-model="settings.fetchResources" type="checkbox" :disabled="!settings.network" />{{ tr("Download files on the internet that a document refers to, and check them") }}</label>
        <label class="check"><input v-model="settings.showHidden" type="checkbox" />{{ tr("Show hidden comments and invisible characters in the preview") }}</label>
        <label class="check"><input v-model="settings.fullText" type="checkbox" />{{ tr("Show the whole text in the range view") }}</label>
      </fieldset>

      <div class="field">
        <label for="tsa">{{ tr("Time-stamping authority URL") }}</label>
        <input id="tsa" v-model="settings.tsaUrl" type="url" spellcheck="false" autocorrect="off" autocapitalize="off" />
      </div>
      <div class="field">
        <label for="tsaroot">{{ tr("Additional TSA root certificates") }}</label>
        <p class="hint">{{ tr("Paste a certificate in PEM format to trust a time-stamping authority that is not built in.") }}</p>
        <ul v-if="settings.tsaRoots.length" class="keylist">
          <li v-for="(r, i) in settings.tsaRoots" :key="i">
            <span class="kd">{{ r.slice(0, 64) }}…</span>
            <span class="ka"><button type="button" class="link" @click="settings.tsaRoots = settings.tsaRoots.filter((_, j) => j !== i)">{{ tr("Delete") }}</button></span>
          </li>
        </ul>
        <textarea id="tsaroot" v-model="rootText" rows="4" placeholder="-----BEGIN CERTIFICATE-----" spellcheck="false" autocorrect="off" autocapitalize="off" />
        <div class="row"><button type="button" :disabled="!rootText.trim()" @click="addRoot()">{{ tr("Add") }}</button><span class="error">{{ rootError }}</span></div>
      </div>
      <div class="field">
        <span class="label">{{ tr("Key directories") }}</span>
        <p class="hint">{{ tr("Used to find the keys of signers who sign with an email address. The list is shared with the mdsig command (mdsig directory trust).") }}</p>
        <ul class="keylist">
          <li v-for="d in DEFAULT_KEY_DIRECTORIES" :key="d"><span>{{ d }}</span><span class="ka hint">{{ tr("Built in") }}</span></li>
          <li v-for="d in stored" :key="d"><span>{{ d }}</span><span class="ka"><button type="button" class="link" @click="run(() => removeKeyDirectory(d))">{{ tr("Remove") }}</button></span></li>
        </ul>
        <div class="inline">
          <input v-model="newDir" type="url" placeholder="https://keys.example.com" spellcheck="false" autocorrect="off" autocapitalize="off" :aria-label="tr('Key directories')" />
          <button type="button" :disabled="!newDir.trim()" @click="run(async () => { await addKeyDirectory(newDir); newDir = ''; })">{{ tr("Add") }}</button>
        </div>
      </div>
      <div class="field">
        <span class="label">{{ tr("Signing pages") }}</span>
        <p class="hint">{{ tr("Where passkey signatures are made. Each key directory's page is listed; add other pages here.") }}</p>
        <ul class="keylist">
          <li v-for="p in pages" :key="p.url">
            <span>{{ p.url }}</span>
            <span class="ka"><span v-if="p.from === 'directory'" class="hint">{{ tr("From a key directory") }}</span><button v-else type="button" class="link" @click="run(() => removeSigningPage(p.url))">{{ tr("Remove") }}</button></span>
          </li>
        </ul>
        <div class="inline">
          <input v-model="newPage" type="url" placeholder="https://sign.example.com/" spellcheck="false" autocorrect="off" autocapitalize="off" :aria-label="tr('Signing pages')" />
          <button type="button" :disabled="!newPage.trim()" @click="run(async () => { await addSigningPage(newPage); newPage = ''; })">{{ tr("Add") }}</button>
        </div>
        <p class="error">{{ listError }}</p>
      </div>
      <div class="field">
        <label for="ks">{{ tr("OpenPGP keyserver") }}</label>
        <input id="ks" v-model="settings.keyserver" type="url" placeholder="https://keys.openpgp.org" spellcheck="false" autocorrect="off" autocapitalize="off" />
      </div>
      <div class="field">
        <label for="kf">{{ tr("SSH key file") }}</label>
        <input id="kf" v-model="settings.keyFile" type="text" placeholder="~/.ssh/id_ed25519" spellcheck="false" autocorrect="off" autocapitalize="off" />
      </div>
    </div>
  </section>
</template>
