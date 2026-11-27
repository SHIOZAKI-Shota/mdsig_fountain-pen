import { DEFAULT_RESOLVERS, DEFAULT_TSA_URL, registerWithDirectory, dohTxt, fromBase64, signDocument, signViaPage, sshFingerprint, timestampDocument, toBase64, type Method, type PgpSigner, type SignOptions, type Signer } from "@mdsig/core";
import { t } from "../lib/i18n.ts";
import { RETURN_URL, transport, viaPage } from "./handoff.ts";
import type { PasskeyRecord } from "./passkeys.ts";
import { documentFetch, netFetch } from "./net.ts";
import { settings } from "./settings.ts";
import { native } from "./native.ts";
import { registrationDirectory, storedKeyDirectories } from "./directories.ts";
import { signerId } from "../lib/input.ts";

export type SignMethod = Method;

export interface SignRequest {
  method: SignMethod;
  signer: string;
  role: string;
  displayName: string;
  reason: string;
  timestamp: boolean;
  tsaUrl: string;
  expires: string;
  scope: string[];
  require: string;
  embedKey: boolean;
  force: boolean;
}

export function expiresAt(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date)) return date;
  return new Date(`${date}T23:59:59`).toISOString().slice(0, 19) + "Z";
}

function signOptions(r: SignRequest): Omit<SignOptions, "signer"> {
  const require = r.require.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    method: r.method,
    signerId: signerId(r),
    ...(r.role ? { role: r.role } : {}),
    ...(r.displayName.trim() ? { displayName: r.displayName.trim() } : {}),
    ...(r.reason.trim() ? { reason: r.reason.trim() } : {}),
    ...(r.expires ? { expires: expiresAt(r.expires) } : {}),
    ...(r.scope.length ? { scope: r.scope } : {}),
    ...(require.length ? { require } : {}),
    ...(r.timestamp ? { tsaUrl: r.tsaUrl || DEFAULT_TSA_URL, ...(settings.tsaRoots.length ? { extraTsaRoots: [...settings.tsaRoots] } : {}) } : {}),
    ...(r.method === "dns" || r.method === "git-hosting" || r.method === "directory" ? { embedKey: r.embedKey } : {}),
    fetch: netFetch,
    force: r.force,
  };
}

export async function signText(text: string, signer: Signer | PgpSigner, r: SignRequest): Promise<string> {
  return (await signDocument(text, { ...signOptions(r), signer })).text;
}

export async function signWithPasskey(text: string, pk: PasskeyRecord, r: SignRequest, name: string): Promise<string> {
  const passkey = { page: pk.page, rpId: pk.rpId, key: fromBase64(pk.key), credential: pk.credential };
  return (await viaPage(() => signViaPage(text, { ...signOptions(r), passkey, returnUrl: RETURN_URL, transport, name }))).text;
}

export async function timestampText(text: string, tsaUrl: string): Promise<string> {
  return (await timestampDocument(text, { tsaUrl: tsaUrl || DEFAULT_TSA_URL, fetch: netFetch })).text;
}

export async function publishedOnGitHosting(signer: string, publicKey: Uint8Array): Promise<boolean> {
  try {
    const fp = await sshFingerprint(publicKey);
    const found = await DEFAULT_RESOLVERS["git-hosting"]!({ signer, method: "git-hosting", alg: "ed25519", key_fp: fp }, { fetch: documentFetch });
    return found.keys.length > 0;
  } catch {
    return false;
  }
}

export async function publishedInDirectory(email: string, publicKey: Uint8Array, alg: "ed25519" | "webauthn-es256"): Promise<boolean> {
  try {
    const found = await DEFAULT_RESOLVERS.directory!({ signer: email, method: "directory", alg }, { fetch: documentFetch, extraKeyDirectories: await storedKeyDirectories() });
    return found.keys.some((k) => k.key.length === publicKey.length && k.key.every((x, i) => x === publicKey[i]));
  } catch {
    return false;
  }
}

export async function registerKey(email: string, signer: Signer): Promise<string> {
  const dir = await registrationDirectory(email);
  await registerWithDirectory(dir, email, signer, { label: await native.hostName().catch(() => undefined), fetch: netFetch });
  return dir;
}

export async function publishedInDns(domain: string, publicKey: Uint8Array): Promise<boolean> {
  const p = toBase64(publicKey);
  const records = await dohTxt(`_mdsig.${domain.trim().toLowerCase().replace(/\.$/, "")}`, { fetch: documentFetch }).catch(() => [] as string[]);
  return records.some((r) => r.replace(/\s+/g, "").includes(`p=${p}`));
}
