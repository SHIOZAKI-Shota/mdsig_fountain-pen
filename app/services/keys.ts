import { formatOpenSshPrivateKey, formatSshPublicKey, fromBase64, generateEd25519, signerFromSeed, sshFingerprint, toBase64, type PgpSigner, type Signer } from "@mdsig/core";
import { dearmorSignature, parseGpgSecretKeys, type GpgKey } from "../lib/gpg.ts";
import { t } from "../lib/i18n.ts";
import { native, readJson } from "./native.ts";
import { settings } from "./settings.ts";
import { passkeys, type PasskeyRecord } from "./passkeys.ts";

export interface StoredKey {
  id: string;
  label: string;
  publicKey: string;
  created: string;
}

export interface KeyChoice {
  id: string;
  kind: "stored" | "agent" | "file" | "gpg" | "passkey";
  label: string;
  detail: string;
  fingerprint?: string;
  publicKey?: Uint8Array;
  emails?: string[];
  file?: { path: string; encrypted: boolean };
  gpg?: GpgKey;
  passkey?: PasskeyRecord;
}

export async function storedKeys(): Promise<StoredKey[]> {
  const list = await readJson<StoredKey[]>(native.localRead("keys.json"), []);
  return Array.isArray(list) ? list : [];
}

async function writeStored(list: StoredKey[]) {
  await native.localWrite("keys.json", JSON.stringify(list, null, 2));
}

export async function createStoredKey(label: string): Promise<StoredKey> {
  const k = await generateEd25519();
  const meta: StoredKey = { id: crypto.randomUUID(), label, publicKey: toBase64(k.publicKey), created: new Date().toISOString() };
  try {
    await native.keychainSet(meta.id, toBase64(k.seed));
  } finally {
    k.seed.fill(0);
  }
  await writeStored([...(await storedKeys()), meta]);
  return meta;
}

export async function removeStoredKey(id: string) {
  await native.keychainDelete(id);
  await writeStored((await storedKeys()).filter((k) => k.id !== id));
}

export async function exportStoredKey(id: string): Promise<string> {
  const meta = (await storedKeys()).find((k) => k.id === id);
  const s = await native.keychainGet(id);
  if (!meta || !s) throw new Error(t("The key was not found in the system keychain"));
  const seed = fromBase64(s);
  try {
    const pub = fromBase64(meta.publicKey);
    return await native.sshKeyExport(meta.label, formatOpenSshPrivateKey(seed, pub, meta.label), formatSshPublicKey(pub, meta.label));
  } finally {
    seed.fill(0);
  }
}

export async function listKeyChoices(o: { pgp: boolean; passkeys?: boolean }): Promise<KeyChoice[]> {
  if (o.pgp) {
    try {
      return parseGpgSecretKeys(await native.gpgSecretKeys()).map((g) => ({ id: `gpg:${g.fpr}`, kind: "gpg", label: g.uids[0] ?? g.fpr, detail: `OpenPGP ${g.fpr}`, emails: g.emails, gpg: g }));
    } catch {
      return [];
    }
  }
  const out: KeyChoice[] = [];
  const seen = new Set<string>();
  const add = (c: KeyChoice) => {
    if (c.fingerprint && seen.has(c.fingerprint)) return;
    if (c.fingerprint) seen.add(c.fingerprint);
    out.push(c);
  };
  for (const f of await native.sshKeyFiles(settings.keyFile).catch(() => [])) {
    const pub = f.public_key ? fromBase64(f.public_key) : undefined;
    const fp = pub ? await sshFingerprint(pub) : undefined;
    add({ id: `file:${f.path}`, kind: "file", label: f.comment || f.name, detail: fp ? `${t("Key file")} ${f.name} · ${fp}` : t("Key file"), fingerprint: fp, publicKey: pub, file: { path: f.path, encrypted: f.encrypted } });
  }
  for (const a of await native.agentKeys().catch(() => [])) {
    const pub = fromBase64(a.public_key);
    const fp = await sshFingerprint(pub);
    add({ id: `agent:${fp}`, kind: "agent", label: a.comment || fp, detail: `ssh-agent · ${fp}`, fingerprint: fp, publicKey: pub });
  }
  for (const m of await storedKeys()) {
    const pub = fromBase64(m.publicKey);
    const fp = await sshFingerprint(pub);
    add({ id: `stored:${m.id}`, kind: "stored", label: m.label, detail: `${t("Saved in the system keychain")} · ${fp}`, fingerprint: fp, publicKey: pub });
  }
  if (o.passkeys) for (const p of await passkeys()) out.push({ id: `passkey:${p.id}`, kind: "passkey", label: p.label, detail: t("Passkey on {0} (signed in the browser)", p.rpId), passkey: p });
  return out;
}

function agentSigner(publicKey: Uint8Array): Signer {
  return {
    alg: "ed25519",
    publicKey,
    async sign(data: Uint8Array) {
      return fromBase64(await native.agentSign(toBase64(publicKey), toBase64(data)));
    },
  };
}

function gpgSigner(k: GpgKey): PgpSigner {
  return {
    alg: "openpgp",
    fpr: k.fpr.toUpperCase(),
    keyAlg: k.keyAlg,
    uids: k.uids,
    emails: k.emails,
    async sign(payload: Uint8Array) {
      return dearmorSignature(fromBase64(await native.gpgSign(k.fpr, toBase64(payload))));
    },
    dispose() {},
  };
}

async function fromSeedB64(b64: string): Promise<Signer> {
  const seed = fromBase64(b64);
  try {
    return await signerFromSeed(seed);
  } finally {
    seed.fill(0);
  }
}

export async function signerFor(c: KeyChoice, askPassphrase: (prompt: string) => Promise<string | null>): Promise<Signer | PgpSigner> {
  if (c.kind === "passkey") throw new Error("passkey");
  if (c.kind === "gpg") return gpgSigner(c.gpg!);
  if (c.kind === "agent") return agentSigner(c.publicKey!);
  if (c.kind === "stored") {
    const s = await native.keychainGet(c.id.slice("stored:".length));
    if (!s) throw new Error(t("The key was not found in the system keychain"));
    return fromSeedB64(s);
  }
  const path = c.file!.path;
  const name = path.split(/[\\/]/).pop() ?? path;
  let pass: string | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fromSeedB64((await native.sshKeyUnlock(path, pass)).seed);
    } catch (e) {
      const msg = String(e);
      if (msg !== "passphrase-required" && msg !== "wrong-passphrase") throw new Error(msg === "not-ed25519" ? t("Only Ed25519 keys can sign md-signature documents") : msg);
      const p = await askPassphrase(msg === "wrong-passphrase" ? t("Wrong passphrase. Try again for {0}", name) : t("Passphrase for {0}", name));
      if (p === null) throw new Error(t("Cancelled"));
      pass = p;
    }
  }
  throw new Error(t("Wrong passphrase"));
}
