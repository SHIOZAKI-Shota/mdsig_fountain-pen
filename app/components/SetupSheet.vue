<script setup lang="ts">
import { onMounted, ref } from "vue";
import { formatSshPublicKey, fromBase64, sshFingerprint, toBase64 } from "@mdsig/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { state, notify } from "../services/doc.ts";
import { tr } from "../services/lang.ts";
import { native } from "../services/native.ts";
import { saveLast } from "../services/settings.ts";
import { createStoredKey, exportStoredKey, signerFor, type StoredKey } from "../services/keys.ts";
import { publishedInDirectory, publishedInDns, publishedOnGitHosting, registerKey } from "../services/sign.ts";

const name = ref("");
const created = ref<null | { meta: StoredKey; ssh: string; fingerprint: string; txt: string }>(null);
const busy = ref(false);
const user = ref("");
const domain = ref("");
const email = ref("");
const sent = ref("");
const result = ref<null | { ok: boolean; where: "github" | "dns" | "directory" }>(null);
const exported = ref("");
const error = ref("");

onMounted(async () => {
  name.value = await native.hostName().catch(() => "");
});

async function create() {
  busy.value = true;
  error.value = "";
  try {
    const meta = await createStoredKey(name.value.trim() || "fountain-pen");
    const pub = fromBase64(meta.publicKey);
    created.value = { meta, ssh: formatSshPublicKey(pub, meta.label), fingerprint: await sshFingerprint(pub), txt: `v=mdsig1; k=ed25519; p=${toBase64(pub)}` };
  } catch (e) {
    error.value = String((e as Error).message ?? e);
  } finally {
    busy.value = false;
  }
}

async function copy(text: string) {
  await writeText(text);
  notify(tr("Copied"), "ok");
}

async function checkGithub() {
  if (!created.value || !user.value.trim()) return;
  busy.value = true;
  const signer = `github.com/${user.value.trim().replace(/^@/, "")}`;
  const ok = await publishedOnGitHosting(signer, fromBase64(created.value.meta.publicKey));
  if (ok) await saveLast({ method: "git-hosting", "git-hosting": signer, key: `stored:${created.value.meta.id}` });
  result.value = { ok, where: "github" };
  busy.value = false;
}

async function checkDns() {
  if (!created.value || !domain.value.trim()) return;
  busy.value = true;
  const d = domain.value.trim().toLowerCase().replace(/\.$/, "");
  const ok = await publishedInDns(d, fromBase64(created.value.meta.publicKey));
  if (ok) await saveLast({ method: "dns", dns: d, key: `stored:${created.value.meta.id}` });
  result.value = { ok, where: "dns" };
  busy.value = false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registerEmail() {
  const e = email.value.trim().toLowerCase();
  if (!created.value || !EMAIL_RE.test(e)) return void (error.value = tr("Enter an email address."));
  busy.value = true;
  error.value = "";
  sent.value = "";
  try {
    const id = `stored:${created.value.meta.id}`;
    const signer = await signerFor({ id, kind: "stored", label: "", detail: "" }, async () => null);
    if (signer.alg !== "ed25519") throw new Error("not-ed25519");
    sent.value = await registerKey(e, signer);
  } catch (x) {
    const msg = String((x as Error).message ?? x);
    error.value = msg === "several-directories" ? tr("The email domain names more than one key directory, so the key cannot be registered.") : tr("Could not register the key: {0}", msg);
  } finally {
    busy.value = false;
  }
}

async function checkDirectory() {
  const e = email.value.trim().toLowerCase();
  if (!created.value || !EMAIL_RE.test(e)) return;
  busy.value = true;
  const ok = await publishedInDirectory(e, fromBase64(created.value.meta.publicKey), "ed25519");
  if (ok) await saveLast({ method: "directory", directory: e, key: `stored:${created.value.meta.id}` });
  result.value = { ok, where: "directory" };
  busy.value = false;
}

async function exportKey() {
  if (!created.value) return;
  try {
    exported.value = await exportStoredKey(created.value.meta.id);
  } catch (e) {
    error.value = String((e as Error).message ?? e);
  }
}

function done() {
  state.sheet = state.doc ? "sign" : null;
}
</script>

<template>
  <section class="sheet">
    <div class="page form">
      <div class="sheet-head">
        <h1>{{ tr("Set up a signing key") }}</h1>
        <div class="spacer" />
        <button type="button" class="quiet" @click="state.sheet = state.doc ? 'sign' : null">{{ tr("Cancel") }}</button>
      </div>
      <p class="lead">{{ tr("A signing key is made on this computer and kept in the system keychain. Only its public part is shared.") }}</p>

      <template v-if="!created">
        <div class="field">
          <label for="kname">{{ tr("Key name") }}</label>
          <input id="kname" v-model="name" type="text" />
        </div>
        <p class="error" role="alert">{{ error }}</p>
        <button type="button" class="primary" :disabled="busy" @click="create()">{{ tr("Create the key") }}</button>
      </template>

      <template v-else>
        <p class="ok-text">✓ {{ tr("Key created") }} <code>{{ created.fingerprint }}</code></p>
        <div class="field">
          <span class="label">{{ tr("Publish the public key") }}</span>
          <p class="hint">{{ tr("Readers find your public key where you publish it. Choose one:") }}</p>
        </div>
        <div class="publish">
          <section>
            <h2>{{ tr("GitHub") }}</h2>
            <p class="hint">{{ tr("1. Copy the public key. 2. Open GitHub's key page. 3. Paste it, choose \"Authentication Key\" as the key type, and save. 4. Enter your user name below and check.") }}</p>
            <pre class="key">{{ created.ssh }}</pre>
            <div class="row">
              <button type="button" @click="copy(created.ssh)">{{ tr("Copy the public key") }}</button>
              <button type="button" @click="openUrl('https://github.com/settings/ssh/new')">{{ tr("Open GitHub's key page") }}</button>
            </div>
            <div class="field">
              <label for="ghuser">{{ tr("GitHub user name") }}</label>
              <div class="inline">
                <input id="ghuser" v-model="user" type="text" spellcheck="false" autocorrect="off" autocapitalize="off" />
                <button type="button" :disabled="busy" @click="checkGithub()">{{ tr("Check") }}</button>
              </div>
            </div>
            <p v-if="result?.where === 'github'" :class="result.ok ? 'ok-text' : 'warn-text'">{{ result.ok ? tr("Published. You can sign now.") : tr("Not found yet. Publishing can take a minute; try again.") }}</p>
          </section>
          <section>
            <h2>{{ tr("Your domain") }}</h2>
            <p class="hint">{{ tr("Add this TXT record in your DNS settings, then enter the domain and check.") }}</p>
            <pre class="key">_mdsig.&lt;domain&gt;  TXT  "{{ created.txt }}"</pre>
            <div class="row"><button type="button" @click="copy(created.txt)">{{ tr("Copy the record value") }}</button></div>
            <div class="field">
              <label for="domain">{{ tr("Domain") }}</label>
              <div class="inline">
                <input id="domain" v-model="domain" type="text" placeholder="example.com" spellcheck="false" autocorrect="off" autocapitalize="off" />
                <button type="button" :disabled="busy" @click="checkDns()">{{ tr("Check") }}</button>
              </div>
            </div>
            <p v-if="result?.where === 'dns'" :class="result.ok ? 'ok-text' : 'warn-text'">{{ result.ok ? tr("Published. You can sign now.") : tr("Not found yet. Publishing can take a minute; try again.") }}</p>
          </section>
          <section>
            <h2>{{ tr("Email address") }}</h2>
            <p class="hint">{{ tr("Send the public key to a key directory, then open the link in the confirmation email. The directory is the one your email domain names, otherwise the first in Settings.") }}</p>
            <div class="field">
              <label for="email">{{ tr("Email address") }}</label>
              <div class="inline">
                <input id="email" v-model="email" type="email" placeholder="you@example.com" spellcheck="false" autocorrect="off" autocapitalize="off" />
                <button type="button" :disabled="busy" @click="registerEmail()">{{ tr("Register") }}</button>
                <button type="button" :disabled="busy" @click="checkDirectory()">{{ tr("Check") }}</button>
              </div>
            </div>
            <p v-if="sent" class="hint">{{ tr("Registration sent to {0}. Open the link in the email sent to {1} to publish the key.", sent, email.trim().toLowerCase()) }}</p>
            <p v-if="result?.where === 'directory'" :class="result.ok ? 'ok-text' : 'warn-text'">{{ result.ok ? tr("Published. You can sign now.") : tr("Not found yet. Open the link in the confirmation email, then check again.") }}</p>
          </section>
        </div>
        <div class="row spaced">
          <button type="button" @click="exportKey()">{{ tr("Also save it to ~/.ssh for the mdsig command line") }}</button>
          <span v-if="exported" class="hint">{{ tr("Saved to {0}", exported) }}</span>
        </div>
        <p class="error" role="alert">{{ error }}</p>
        <button v-if="state.doc" type="button" class="primary" @click="done()">{{ tr("Sign a document") }}</button>
      </template>
    </div>
  </section>
</template>
