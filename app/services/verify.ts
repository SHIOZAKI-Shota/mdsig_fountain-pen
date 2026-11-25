import { keyFingerprint, verifyDocument, type TofuStore, type VerifyOptions, type VerifyResult } from "@mdsig/core";
import { layout } from "../lib/ranges.ts";
import type { Entry, NewKey } from "../lib/entry.ts";
import { native, readJson } from "./native.ts";
import { documentFetch } from "./net.ts";
import { settings } from "./settings.ts";
import { storedKeyDirectories } from "./directories.ts";

const FILE = "known_signers.json";

async function readKnown(): Promise<Record<string, string>> {
  const d = await readJson<unknown>(native.sharedRead(FILE), {});
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, string>) : {};
}

async function writeKnown(update: (d: Record<string, string>) => void) {
  const current = await readKnown();
  update(current);
  await native.sharedWrite(FILE, JSON.stringify(current, null, 2) + "\n");
}

class FileTofuStore implements TofuStore {
  private data: Record<string, string> = {};
  async load() {
    this.data = await readKnown();
  }
  get(signer: string) {
    return Object.hasOwn(this.data, signer) ? this.data[signer] : undefined;
  }
  async set(signer: string, pubkey: string) {
    this.data[signer] = pubkey;
    await writeKnown((d) => {
      d[signer] = pubkey;
    });
  }
}

export interface KnownSigner {
  signer: string;
  key: string;
  fingerprint: string;
}

export async function knownSigners(): Promise<KnownSigner[]> {
  const d = await readKnown();
  return Promise.all(Object.entries(d).map(async ([signer, key]) => ({ signer, key, fingerprint: await keyFingerprint(key).catch(() => "?") })));
}

export async function trustKey(signer: string, key: string) {
  await writeKnown((d) => {
    d[signer] = key;
  });
}

export async function forgetSigner(signer: string) {
  await writeKnown((d) => {
    delete d[signer];
  });
}

async function pgpKeyring(fpr: string): Promise<Uint8Array | null> {
  try {
    const b = await native.gpgExport(fpr);
    return b ? Uint8Array.from(atob(b), (c) => c.charCodeAt(0)) : null;
  } catch {
    return null;
  }
}

export interface VerifyTarget {
  path: string | null;
  text: string;
}

export async function runVerify(doc: VerifyTarget, o: { online: boolean; acceptNewKey?: boolean }): Promise<Entry> {
  const online = o.online && settings.network;
  const tofu = new FileTofuStore();
  await tofu.load();
  const opts: VerifyOptions = {
    offline: !online,
    fetch: documentFetch,
    tofuStore: tofu,
    acceptNewTofuKey: !!o.acceptNewKey,
    // security: a key seen for the first time is stored only after the user trusts it (SPEC 4.4)
    confirmNewTofuKeys: true,
    pgpKeyring,
    extraKeyDirectories: await storedKeyDirectories(),
    ...(settings.keyserver ? { keyserver: settings.keyserver } : {}),
    checkRevocation: online && settings.checkRevocation,
    fetchResources: online && settings.fetchResources,
    ...(doc.path ? { loadResource: (ref: string) => loadResource(doc.path!, ref) } : {}),
    ...(settings.tsaRoots.length ? { extraTsaRoots: [...settings.tsaRoots] } : {}),
  };
  let result: VerifyResult;
  try {
    result = await verifyDocument(doc.text, opts);
  } catch (e) {
    result = { ok: false, signatures: [], agreement: { status: "none", required: [], missing: [], violations: [] }, warnings: [], error: String((e as Error).message ?? e) };
  }
  const newKeys: NewKey[] = result.signatures.filter((s) => s.tofu?.status === "new").map((s) => ({ signer: s.fields.signer!, key: s.fields.pubkey!, fingerprint: s.tofu!.fingerprint }));
  return { text: doc.text, online, result, layout: layout(doc.text), newKeys };
}

async function loadResource(doc: string, ref: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await native.readResource(doc, ref));
  } catch {
    return null;
  }
}
