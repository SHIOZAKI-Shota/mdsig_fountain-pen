import { connectPasskeyViaPage, decodePublicKey, toBase64 } from "@mdsig/core";
import { native, readJson } from "./native.ts";
import { RETURN_URL, transport, viaPage } from "./handoff.ts";

export interface PasskeyRecord {
  id: string;
  page: string;
  rpId: string;
  key: string;
  credential: string;
  label: string;
  added: string;
}

export async function passkeys(): Promise<PasskeyRecord[]> {
  const list = await readJson<PasskeyRecord[]>(native.localRead("passkeys.json"), []);
  return Array.isArray(list) ? list : [];
}

async function write(list: PasskeyRecord[]) {
  await native.localWrite("passkeys.json", JSON.stringify(list, null, 2));
}

export async function connectPasskey(page: string, label: string): Promise<PasskeyRecord> {
  const p = await viaPage(() => connectPasskeyViaPage(page, { returnUrl: RETURN_URL, transport }));
  decodePublicKey("es256", p.key);
  const rec = { page, rpId: p.rpId.toLowerCase(), key: toBase64(p.key), credential: p.credential };
  const list = await passkeys();
  const existing = list.find((x) => x.rpId === rec.rpId && x.credential === rec.credential);
  if (existing) return existing;
  const full: PasskeyRecord = { ...rec, id: crypto.randomUUID(), label: label || rec.rpId, added: new Date().toISOString() };
  await write([...list, full]);
  return full;
}

export async function removePasskey(id: string) {
  await write((await passkeys()).filter((x) => x.id !== id));
}
