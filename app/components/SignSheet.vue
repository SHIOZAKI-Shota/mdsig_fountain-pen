<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { findSections, fromBase64, parseDocument, type Signer } from "@mdsig/core";
import { scanBody } from "../lib/findings.ts";
import { coreText } from "../lib/present.ts";
import { checkInput, signerId as canonicalSigner } from "../lib/input.ts";
import { state, setText, save, notify, revealLine } from "../services/doc.ts";
import { tr, lang } from "../services/lang.ts";
import { settings, loadLast, saveLast } from "../services/settings.ts";
import { confirmDialog, askDialog } from "../services/dialog.ts";
import { listKeyChoices, signerFor, type KeyChoice } from "../services/keys.ts";
import { HandoffCancelled } from "../services/handoff.ts";
import { publishedInDirectory, publishedOnGitHosting, registerKey, signText, signWithPasskey, type SignMethod, type SignRequest } from "../services/sign.ts";

const METHODS: { id: SignMethod; title: string; desc: string; placeholder: string; disabled?: boolean }[] = [
  { id: "git-hosting", title: "GitHub or GitLab account", desc: "Readers check your signature with the SSH keys published on your account.", placeholder: "github.com/your-name" },
  { id: "dns", title: "Company or personal domain", desc: "Readers check your signature with a key published in your domain's DNS.", placeholder: "example.com" },
  { id: "directory", title: "Email address", desc: "Readers check your signature with the key that a key directory confirmed for your email address.", placeholder: "you@example.com" },
  { id: "pgp", title: "OpenPGP key", desc: "Uses your OpenPGP key from gpg. Readers find it by email address.", placeholder: "you@example.com" },
  { id: "tofu", title: "This key only", desc: "Proves that the document has not changed since you signed, but not who you are.", placeholder: "your name" },
];
const ROLES = ["", "author", "reviewer", "approver", "witness"];
const roleLabel: Record<string, string> = { "": "(not specified)", author: "Author", reviewer: "Reviewer", approver: "Approver", witness: "Witness" };

const form = reactive<SignRequest>({ method: "git-hosting", signer: "", role: "", displayName: "", reason: "", timestamp: true, tsaUrl: settings.tsaUrl, expires: "", scope: [], require: "", embedKey: false, force: false });
const keys = ref<KeyChoice[]>([]);
const keyId = ref("");
const loadingKeys = ref(false);
const busy = ref(false);
const error = ref("");
let last: Record<string, string> = {};

const text = computed(() => state.doc?.text ?? "");
const parsed = computed(() => parseDocument(text.value));
const sections = computed(() => [...findSections(text.value).sections.keys()]);
const bodyLines = computed(() => (parsed.value.body.match(/\n/g)?.length ?? 0) + 1);
const tail = computed(() => !!state.entry?.layout.tail || (parsed.value.chain.length === 0 && parsed.value.strayMarker));
const method = computed(() => METHODS.find((m) => m.id === form.method)!);
const findings = computed(() => scanBody(text.value));
const passkeyOk = computed(() => form.method === "tofu" || form.method === "dns" || form.method === "directory");
const canRegister = computed(() => {
  const k = keys.value.find((x) => x.id === keyId.value);
  return form.method === "directory" && !!k && k.kind !== "passkey" && k.kind !== "gpg";
});
const target = computed(() => {
  const s = form.signer.trim();
  if (form.method === "git-hosting" && !s.includes("/") && s) return canonicalSigner({ method: "git-hosting", signer: `github.com/${s.replace(/^@/, "")}` });
  return canonicalSigner({ method: form.method, signer: s });
});
const check = computed(() => checkInput({ method: form.method, signer: target.value, displayName: form.displayName, require: form.require }, lang.value === "ja" ? "ja" : "en"));
const openFence = computed(() => parsed.value.unclosedFence);
const blocked = computed(() => !!(check.value.signer || check.value.displayName || check.value.require?.blocking) || openFence.value);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadKeys() {
  loadingKeys.value = true;
  try {
    keys.value = await listKeyChoices({ pgp: form.method === "pgp", passkeys: passkeyOk.value });
    const remembered = keys.value.find((k) => k.id === last.key);
    keyId.value = (remembered ?? keys.value[0])?.id ?? "";
    if (form.method === "pgp" && !form.signer) form.signer = keys.value.find((k) => k.id === keyId.value)?.emails?.[0] ?? "";
  } finally {
    loadingKeys.value = false;
  }
}

const moreOpen = ref(false);

onMounted(async () => {
  if (state.signScope) {
    form.scope = [...state.signScope];
    state.signScope = null;
    moreOpen.value = true;
  }
  last = await loadLast();
  if (last.method && METHODS.some((m) => m.id === last.method && !m.disabled)) form.method = last.method as SignMethod;
  form.signer = last[form.method] ?? "";
  form.embedKey = form.method === "directory";
  await loadKeys();
});

watch(
  () => form.method,
  async (m) => {
    form.signer = last[m] ?? "";
    form.embedKey = m === "directory";
    error.value = "";
    await loadKeys();
  },
);

watch(keyId, (id) => {
  if (form.method !== "pgp") return;
  const k = keys.value.find((x) => x.id === id);
  if (k?.emails?.length && !k.emails.includes(form.signer)) form.signer = k.emails[0]!;
});

async function confirmUnregistered(email: string) {
  if (!(await confirmDialog(tr("No key directory has this key for {0} yet, so readers cannot check the signature until you register it and confirm the email.", email), tr("Sign anyway"), tr("Cancel")))) throw new Error(tr("Cancelled"));
}

async function register() {
  error.value = "";
  const email = target.value;
  if (!EMAIL_RE.test(email)) return void (error.value = tr("Enter an email address."));
  const choice = keys.value.find((k) => k.id === keyId.value);
  if (!choice) return;
  busy.value = true;
  try {
    const signer = await signerFor(choice, (p) => askDialog(p, tr("Unlock"), tr("Cancel")));
    const dispose = () => (signer as { dispose?: () => void }).dispose?.();
    if (signer.alg !== "ed25519") {
      dispose();
      throw new Error(tr("Only Ed25519 keys can sign md-signature documents"));
    }
    const dir = await registerKey(email, signer as Signer).finally(dispose);
    notify(tr("Registration sent to {0}. Open the link in the email sent to {1} to publish the key.", dir, email), "ok");
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (msg === "several-directories") error.value = tr("The email domain names more than one key directory, so the key cannot be registered.");
    else if (msg !== tr("Cancelled")) error.value = tr("Could not register the key: {0}", msg);
  } finally {
    busy.value = false;
  }
}

async function submit() {
  error.value = "";
  const d = state.doc;
  if (!d) return;
  const signerId = target.value;
  if (!signerId) return void (error.value = tr("Enter who you are signing as."));
  if (form.method === "directory" && !EMAIL_RE.test(signerId)) return void (error.value = tr("Enter an email address."));
  const choice = keys.value.find((k) => k.id === keyId.value);
  if (!choice) return void (error.value = tr("Choose a key."));
  if (blocked.value) return void (error.value = check.value.signer ?? check.value.displayName ?? check.value.require?.errors.join("\n") ?? tr("The document ends inside an open code block. Close it before signing, otherwise every signature would be shown as code."));
  busy.value = true;
  try {
    const before = d.text;
    const request = { ...form, signer: signerId, scope: [...form.scope] };
    let out: string;
    if (choice.kind === "passkey") {
      if (form.method === "directory" && !(await publishedInDirectory(signerId, fromBase64(choice.passkey!.key), "webauthn-es256"))) await confirmUnregistered(signerId);
      out = await signWithPasskey(before, choice.passkey!, request, d.name);
    } else {
      const signer = await signerFor(choice, (p) => askDialog(p, tr("Unlock"), tr("Cancel")));
      if (form.method === "git-hosting" && signer.alg === "ed25519" && !(await publishedOnGitHosting(signerId, signer.publicKey))) {
        if (!(await confirmDialog(tr("This key is not published on {0} yet, so readers cannot check the signature until you add it to the account.", signerId), tr("Sign anyway"), tr("Cancel")))) throw new Error(tr("Cancelled"));
      }
      if (form.method === "directory" && signer.alg === "ed25519" && !(await publishedInDirectory(signerId, signer.publicKey, "ed25519"))) await confirmUnregistered(signerId);
      out = await signText(before, signer, request);
      if ("dispose" in signer) signer.dispose();
    }
    if (state.doc !== d || d.text !== before) throw new Error(tr("The document changed while signing. Try again."));
    await saveLast({ method: form.method, [form.method]: signerId, key: choice.id });
    setText(out, { online: true });
    state.sheet = null;
    state.mode = "status";
    if (await confirmDialog(form.timestamp ? tr("Signed as {0}, with a timestamp block after the signature. Save the file to keep the signature.", signerId) : tr("Signed as {0}. Save the file to keep the signature.", signerId), tr("Save"), tr("Later"))) await save();
    else notify(tr("Signed. The signature is kept only after you save."), "muted");
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (msg !== tr("Cancelled") && !(e instanceof HandoffCancelled)) error.value = coreText(msg);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="sheet">
    <div class="page form">
      <div class="sheet-head">
        <h1>{{ tr("Sign this document") }}</h1>
        <div class="spacer" />
        <button type="button" class="quiet" @click="state.sheet = null">{{ tr("Cancel") }}</button>
      </div>
      <p class="lead">{{ state.doc?.name }}</p>
      <div v-if="findings.length" class="findings findings-sign">
        <h3>⚠ {{ tr("This document has {0} item(s) that may not appear as written", findings.length) }}</h3>
        <p class="note">{{ tr("Your signature covers the source, including hidden comments and invisible characters. Check the source before you sign an important document.") }}</p>
        <button type="button" @click="revealLine(findings[0]!.line)">{{ tr("Check the source") }}</button>
      </div>

      <fieldset>
        <legend>{{ tr("Sign as") }}</legend>
        <div class="method-list">
          <label v-for="m in METHODS" :key="m.id" class="method" :class="{ disabled: m.disabled }">
            <input v-model="form.method" type="radio" name="method" :value="m.id" :disabled="m.disabled" />
            <span class="m-title">{{ tr(m.title) }}</span>
            <span class="m-desc">{{ tr(m.desc) }}</span>
          </label>
        </div>
      </fieldset>

      <div class="field">
        <label for="signer">{{ tr("Account, domain, or name") }}</label>
        <input id="signer" v-model="form.signer" type="text" :placeholder="tr(method.placeholder)" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" />
        <p v-if="check.signer" class="field-error" role="alert">{{ tr("The signer is not valid: {0}", check.signer) }}</p>
      </div>

      <div class="field">
        <label for="key">{{ tr("Key") }}</label>
        <select v-if="keys.length" id="key" v-model="keyId">
          <option v-for="k in keys" :key="k.id" :value="k.id">{{ k.label }} · {{ k.detail }}</option>
        </select>
        <p v-if="keys.length && (passkeyOk || canRegister)" class="hint">
          <button v-if="canRegister" type="button" class="link" :disabled="busy" @click="register()">{{ tr("Register this key with a key directory") }}</button>
          <span v-if="canRegister && passkeyOk"> · </span>
          <button v-if="passkeyOk" type="button" class="link" @click="state.sheet = 'keys'">{{ tr("Connect a passkey") }}</button>
        </p>
        <p v-else-if="loadingKeys" class="hint">{{ tr("Looking for keys…") }}</p>
        <div v-else>
          <p class="hint">{{ form.method === "pgp" ? tr("No OpenPGP key with signing capability was found in gpg.") : tr("No key found. Create one first.") }}</p>
          <div v-if="form.method !== 'pgp'" class="row">
            <button type="button" @click="state.sheet = 'setup'">{{ tr("Create a key") }}</button>
            <button v-if="passkeyOk" type="button" @click="state.sheet = 'keys'">{{ tr("Use a passkey") }}</button>
          </div>
        </div>
      </div>

      <div class="field">
        <label for="role">{{ tr("Role") }}</label>
        <select id="role" v-model="form.role">
          <option v-for="r in ROLES" :key="r" :value="r">{{ tr(roleLabel[r]!) }}</option>
        </select>
      </div>
      <div class="field">
        <label for="display-name">{{ tr("Display name (optional)") }}</label>
        <input id="display-name" v-model="form.displayName" type="text" maxlength="64" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" />
        <p class="hint">{{ tr("Shown next to your verified identity and marked as self-declared.") }}</p>
        <p v-if="check.displayName" class="field-error" role="alert">{{ tr("The display name is not valid: {0}", check.displayName) }}</p>
      </div>
      <div class="field">
        <label for="reason">{{ tr("Comment (optional)") }}</label>
        <input id="reason" v-model="form.reason" type="text" />
      </div>

      <details class="more" :open="moreOpen" @toggle="moreOpen = ($event.target as HTMLDetailsElement).open">
        <summary>{{ tr("More options") }}</summary>
        <label class="check"><input v-model="form.timestamp" type="checkbox" />{{ tr("Add a timestamp from a time-stamping authority (recommended)") }}</label>
        <div v-if="form.timestamp" class="field">
          <label for="tsa">{{ tr("Time-stamping authority URL") }}</label>
          <input id="tsa" v-model="form.tsaUrl" type="url" spellcheck="false" autocorrect="off" autocapitalize="off" />
        </div>
        <div class="field">
          <label for="expires">{{ tr("Valid until (optional)") }}</label>
          <input id="expires" v-model="form.expires" type="date" />
        </div>
        <div v-if="sections.length" class="field">
          <span class="label">{{ tr("Sign only these sections") }}</span>
          <div class="chips">
            <label v-for="s in sections" :key="s" class="check"><input v-model="form.scope" type="checkbox" :value="s" />{{ s }}</label>
          </div>
        </div>
        <div class="field">
          <span class="label">{{ tr("Signatures still needed after yours") }}</span>
          <p class="hint">{{ tr("One requirement per line, for example dns:example.com role=approver. Group lines with step or step any=2, and set the order with order mode=guide or order mode=strict.") }}</p>
          <RequireBuilder v-model="form.require" />
          <label for="require">{{ tr("Edit as text") }}</label>
          <textarea id="require" v-model="form.require" rows="4" placeholder="dns:example.com role=approver" spellcheck="false" autocorrect="off" autocapitalize="off" />
          <pre v-if="check.require?.explanation" class="explain">{{ check.require.explanation }}</pre>
          <p v-for="(p, i) in check.require?.errors ?? []" :key="i" class="field-error">{{ p }}</p>
          <p v-for="(p, i) in check.require?.warnings ?? []" :key="`w${i}`" class="field-warn">{{ p }}</p>
        </div>
        <label v-if="form.method === 'dns' || form.method === 'git-hosting' || form.method === 'directory'" class="check"><input v-model="form.embedKey" type="checkbox" />{{ tr("Include the public key in the signature, so it can still be checked if the key is removed") }}</label>
      </details>

      <p class="covers">{{ form.scope.length ? tr("Your signature will cover only the selected sections.") : tr("Your signature will cover the whole document as it is now: {0} lines of text and {1} earlier signature(s).", bodyLines, parsed.chain.length) }}</p>
      <p v-if="openFence" class="warn-text">{{ tr("The document ends inside an open code block. Close it before signing, otherwise every signature would be shown as code.") }}</p>
      <template v-if="tail">
        <p class="warn-text">{{ tr("There is text after the last signature that nobody signed. Signing now would approve it on behalf of the earlier signers.") }}</p>
        <label class="check"><input v-model="form.force" type="checkbox" />{{ tr("Sign the whole file as a new document (the earlier signatures stay, but no longer cover the end)") }}</label>
      </template>
      <p class="error" role="alert">{{ error }}</p>
      <button type="button" class="primary big" :disabled="busy || !keys.length || (tail && !form.force) || blocked" @click="submit()">{{ busy ? tr("Signing…") : tr("Sign") }}</button>
    </div>
  </section>
</template>
