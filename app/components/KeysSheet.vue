<script setup lang="ts">
import { onMounted, ref } from "vue";
import { formatSshPublicKey, fromBase64, sshFingerprint } from "@mdsig/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { state, notify } from "../services/doc.ts";
import { tr } from "../services/lang.ts";
import { confirmDialog } from "../services/dialog.ts";
import { exportStoredKey, listKeyChoices, removeStoredKey, storedKeys, type KeyChoice, type StoredKey } from "../services/keys.ts";
import { forgetSigner, knownSigners, type KnownSigner } from "../services/verify.ts";
import { connectPasskey, passkeys, removePasskey, type PasskeyRecord } from "../services/passkeys.ts";
import { signingPages, type SigningPage } from "../services/directories.ts";
import { HandoffCancelled } from "../services/handoff.ts";
import { verifyNow } from "../services/doc.ts";

const stored = ref<(StoredKey & { fingerprint: string })[]>([]);
const others = ref<KeyChoice[]>([]);
const loading = ref(true);
const known = ref<KnownSigner[]>([]);
const pks = ref<PasskeyRecord[]>([]);
const pages = ref<SigningPage[]>([]);
const page = ref("");
const connecting = ref(false);

async function load() {
  loading.value = true;
  stored.value = await Promise.all((await storedKeys()).map(async (k) => ({ ...k, fingerprint: await sshFingerprint(fromBase64(k.publicKey)) })));
  others.value = [...(await listKeyChoices({ pgp: false })).filter((k) => k.kind !== "stored"), ...(await listKeyChoices({ pgp: true }))];
  known.value = (await knownSigners()).sort((a, b) => a.signer.localeCompare(b.signer));
  pks.value = await passkeys();
  pages.value = await signingPages();
  if (!pages.value.some((p) => p.url === page.value)) page.value = pages.value[0]?.url ?? "";
  loading.value = false;
}
onMounted(load);

async function copy(k: StoredKey) {
  await writeText(formatSshPublicKey(fromBase64(k.publicKey), k.label));
  notify(tr("Copied"), "ok");
}

async function exportKey(k: StoredKey) {
  try {
    notify(tr("Saved to {0}", await exportStoredKey(k.id)), "ok");
  } catch (e) {
    notify(String((e as Error).message ?? e), "bad");
  }
}

async function connect() {
  if (!page.value) return;
  connecting.value = true;
  try {
    const rec = await connectPasskey(page.value, "");
    notify(tr("Passkey on {0} connected", rec.rpId), "ok");
    await load();
  } catch (e) {
    if (!(e instanceof HandoffCancelled)) notify(String((e as Error).message ?? e), "bad");
  } finally {
    connecting.value = false;
  }
}

async function dropPasskey(p: PasskeyRecord) {
  if (!(await confirmDialog(tr("Remove the passkey on {0} from this app? The passkey itself stays in your device or password manager.", p.rpId), tr("Remove"), tr("Cancel"), true))) return;
  await removePasskey(p.id);
  await load();
}

async function forget(k: KnownSigner) {
  if (!(await confirmDialog(tr("Stop trusting the key of {0}? The next document from this signer will show the key as new.", k.signer), tr("Remove"), tr("Cancel"), true))) return;
  await forgetSigner(k.signer);
  await load();
  void verifyNow(false);
}

async function remove(k: StoredKey) {
  if (!(await confirmDialog(tr("Delete the key \"{0}\"? Documents you signed stay valid only while the public key stays published.", k.label), tr("Delete"), tr("Cancel"), true))) return;
  await removeStoredKey(k.id);
  await load();
}
</script>

<template>
  <section class="sheet">
    <div class="page form">
      <div class="sheet-head">
        <h1>{{ tr("Keys") }}</h1>
        <div class="spacer" />
        <button type="button" class="quiet" @click="state.sheet = null">{{ tr("Close") }}</button>
      </div>
      <p class="lead">{{ tr("Keys saved in the system keychain") }}</p>
      <ul v-if="stored.length" class="keylist">
        <li v-for="k in stored" :key="k.id">
          <b>{{ k.label }}</b>
          <span class="ka">
            <button type="button" class="link" @click="copy(k)">{{ tr("Copy the public key") }}</button>
            <button type="button" class="link" @click="exportKey(k)">{{ tr("Save to ~/.ssh") }}</button>
            <button type="button" class="link" @click="remove(k)">{{ tr("Delete") }}</button>
          </span>
          <span class="kd">{{ k.fingerprint }} · {{ tr("Created {0}", k.created.slice(0, 10)) }}</span>
        </li>
      </ul>
      <p v-else-if="!loading" class="hint">{{ tr("No keys are saved in the app yet.") }}</p>
      <div class="row"><button type="button" class="primary" @click="state.sheet = 'setup'">{{ tr("Create a key") }}</button></div>

      <p class="lead sub-head">{{ tr("Passkeys") }}</p>
      <p class="hint">{{ tr("A passkey signs on a signing page in your browser. Choose the signing page of the key directory or site where the passkey is registered.") }}</p>
      <ul v-if="pks.length" class="keylist">
        <li v-for="p in pks" :key="p.id">
          <b>{{ p.label }}</b>
          <span class="ka"><button type="button" class="link" @click="dropPasskey(p)">{{ tr("Remove") }}</button></span>
          <span class="kd">{{ p.rpId }} · {{ p.page }}</span>
        </li>
      </ul>
      <div class="inline spaced-sm">
        <select v-model="page" :aria-label="tr('Signing page')">
          <option v-for="p in pages" :key="p.url" :value="p.url">{{ p.url }}</option>
        </select>
        <button type="button" :disabled="!page || connecting" @click="connect()">{{ tr("Connect a passkey") }}</button>
      </div>
      <p class="hint">{{ tr("Signing pages come from the trusted key directories and the pages added in Settings.") }}</p>

      <p class="lead sub-head">{{ tr("Trusted signers (keys only)") }}</p>
      <p class="hint">{{ tr("Keys you trusted when they were seen for the first time. The mdsig command uses the same list.") }}</p>
      <ul v-if="known.length" class="keylist">
        <li v-for="k in known" :key="k.signer">
          <b>{{ k.signer }}</b>
          <span class="ka"><button type="button" class="link" @click="forget(k)">{{ tr("Remove") }}</button></span>
          <span class="kd">{{ k.fingerprint }}</span>
        </li>
      </ul>
      <p v-else-if="!loading" class="hint">{{ tr("No trusted signers yet.") }}</p>

      <template v-if="others.length">
        <p class="lead sub-head">{{ tr("Other keys found on this computer") }}</p>
        <ul class="keylist">
          <li v-for="k in others" :key="k.id">
            <b>{{ k.label }}</b>
            <span />
            <span class="kd">{{ k.detail }}</span>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
