import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_KEY_DIRECTORIES, connectPasskeyViaPage, createHandoffRequest, directoryKeyUrl, fromBase64Url, keyFingerprint, parseDocument, sshFingerprint, toBase64Url, verifyDocument, generateEd25519, toBase64 } from "@mdsig/core";
import { HandoffCancelled, handleHandoffUrl, setHandoffOpener, transport, RETURN_URL } from "../app/services/handoff.ts";
import type { PasskeyRecord } from "../app/services/passkeys.ts";
import { expiresAt, signWithPasskey, type SignRequest } from "../app/services/sign.ts";
import { signingPage } from "./mock/signing-page.ts";
import { setLang } from "../app/lib/i18n.ts";

setLang("en");

const PAGE = "https://keys.example.org/sign";
const request = (o: Partial<SignRequest> = {}): SignRequest => ({ method: "tofu", signer: "alice", role: "approver", reason: "", timestamp: false, tsaUrl: "", expires: "", scope: [], require: "", embedKey: false, force: false, ...o });

function useSigningPage(change?: (u: URL) => void, refuse?: string) {
  setHandoffOpener(async (url) => {
    const r = await signingPage(url, { refuse });
    assert.ok(r);
    const u = new URL(r);
    change?.(u);
    setTimeout(() => handleHandoffUrl(u.toString()), 0);
  });
}

async function connect(): Promise<PasskeyRecord> {
  useSigningPage();
  const p = await connectPasskeyViaPage(PAGE, { returnUrl: RETURN_URL, transport });
  return { page: PAGE, rpId: p.rpId, key: toBase64(p.key), credential: p.credential, id: "1", label: "test", added: "" };
}

test("requests carry the app's return URL and a fresh state", () => {
  const a = new URL(createHandoffRequest(PAGE, { op: "key", returnUrl: RETURN_URL }).url);
  const b = new URL(createHandoffRequest(PAGE, { op: "key", returnUrl: RETURN_URL }).url);
  assert.equal(a.searchParams.get("return"), RETURN_URL);
  assert.notEqual(a.searchParams.get("state"), b.searchParams.get("state"));
  assert.ok(RETURN_URL.startsWith("mdsig+fountain-pen://"));
});

test("answers with an unknown state or another scheme are ignored", () => {
  assert.equal(handleHandoffUrl("mdsig+fountain-pen://handoff?v=1&state=nope"), false);
  assert.equal(handleHandoffUrl("https://evil.example/?v=1&state=x"), false);
});

test("a passkey is connected and signs a tofu block that verifies", async () => {
  const pk = await connect();
  assert.equal(pk.rpId, "keys.example.org");
  useSigningPage();
  const out = await signWithPasskey("# Contract\n\nPay 100.\n", pk, request(), "contract.md");
  const block = parseDocument(out).chain[0]!;
  assert.equal(block.fields.alg, "webauthn-es256");
  assert.equal(block.fields.rp_id, "keys.example.org");
  assert.equal(block.fields.role, "approver");
  const r = await verifyDocument(out, { offline: true });
  assert.equal(r.signatures[0]!.status, "valid", r.signatures[0]!.message);
});

test("a tampered answer is refused", async () => {
  const pk = await connect();
  useSigningPage((u) => {
    const sig = fromBase64Url(u.searchParams.get("sig")!);
    sig[sig.length - 1] ^= 1;
    u.searchParams.set("sig", toBase64Url(sig));
  });
  await assert.rejects(signWithPasskey("# T\n", pk, request(), "t.md"), /does not verify/);
});

test("a refusal from the page is reported and each state is used once", async () => {
  const pk = await connect();
  useSigningPage(undefined, "cancelled");
  await assert.rejects(signWithPasskey("# T\n", pk, request(), "t.md"), (e) => e instanceof HandoffCancelled);
  let answer = "";
  setHandoffOpener(async (url) => {
    answer = (await signingPage(url))!;
    setTimeout(() => handleHandoffUrl(answer), 0);
  });
  await connectPasskeyViaPage(PAGE, { returnUrl: RETURN_URL, transport });
  assert.equal(handleHandoffUrl(answer), false);
});

test("answers for another site are refused", async () => {
  useSigningPage((u) => u.searchParams.set("rp_id", "evil.org"));
  await assert.rejects(connectPasskeyViaPage(PAGE, { returnUrl: RETURN_URL, transport }), /RP ID/);
});

test("dates become an end-of-day timestamp", () => {
  assert.match(expiresAt("2027-03-31"), /^2027-0[34]-\d{2}T\d{2}:59:59Z$/);
  assert.equal(expiresAt("2027-03-31T00:00:00Z"), "2027-03-31T00:00:00Z");
});

test("fingerprints follow the CLI rules", async () => {
  const k = await generateEd25519();
  assert.equal(await keyFingerprint(`ed25519:${toBase64(k.publicKey)}`), await sshFingerprint(k.publicKey));
  assert.match(await keyFingerprint("es256:AAEC"), /^SHA256:[A-Za-z0-9+/]+$/);
});

test("a passkey signs a directory block that verifies against the key directory", async () => {
  const pk = await connect();
  useSigningPage();
  const out = await signWithPasskey("# Contract\n\nPay 100.\n", pk, request({ method: "directory", signer: "alice@example.org", embedKey: true }), "contract.md");
  const block = parseDocument(out).chain[0]!;
  assert.equal(block.fields.method, "directory");
  assert.equal(block.fields.pubkey, `es256:${pk.key}`);
  const keyUrl = await directoryKeyUrl(DEFAULT_KEY_DIRECTORIES[0]!, "alice@example.org");
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === keyUrl) return Response.json({ email: "alice@example.org", verified: true, keys: [{ type: "es256", key: pk.key, added: "2026-11-19T00:00:00Z" }] });
    if (url.includes("dns-query") || url.includes("resolve")) return Response.json({ Status: 3, Answer: [] });
    return new Response("", { status: 404 });
  }) as typeof globalThis.fetch;
  const r = await verifyDocument(out, { fetch });
  assert.equal(r.signatures[0]!.status, "valid", r.signatures[0]!.message);
});
