import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyDocument } from "@mdsig/core";
import { layout } from "../app/lib/ranges.ts";
import { locks, lockedSpans, touches } from "../app/lib/locks.ts";
import { buildModel } from "../app/lib/model.ts";
import { summarize } from "../app/lib/present.ts";
import { parseGpgSecretKeys, dearmorSignature } from "../app/lib/gpg.ts";
import { setLang, t } from "../app/lib/i18n.ts";

const ex = (n: string) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");

function spansFor(text: string) {
  const lines = text.split("\n");
  const starts: number[] = [];
  let o = 0;
  for (const l of lines) {
    starts.push(o);
    o += l.length + 1;
  }
  const lk = locks(layout(text));
  return { lk, spans: lockedSpans(lk, (n) => starts[n - 1]!, (n) => starts[n - 1]! + lines[n - 1]!.length, text.length), starts, lines };
}

test("an unsigned document is free to edit", () => {
  const { lk, spans } = spansFor("# Title\n\nbody\n");
  assert.equal(lk.kind, "free");
  assert.deepEqual(spans, []);
});

test("a whole-document signature locks everything", () => {
  const text = ex("valid-single.md");
  const { lk, spans } = spansFor(text);
  assert.equal(lk.kind, "full");
  assert.deepEqual(spans, [{ from: 0, to: text.length }]);
  assert.ok(touches(spans, 0, 0));
});

test("scoped signatures lock their sections and the chain only", () => {
  const text = ex("valid-scoped-edited.md");
  const { lk, spans, starts, lines } = spansFor(text);
  assert.equal(lk.kind, "scoped");
  assert.ok(lk.lines.length >= 1);
  const open = lines.findIndex((l) => l.startsWith("<!-- mdsig:section"));
  const close = lines.findIndex((l, i) => i > open && l.startsWith("<!-- /mdsig:section"));
  assert.ok(touches(spans, starts[open]! + 3, starts[open]! + 3));
  assert.ok(touches(spans, starts[close]!, starts[close]!));
  const firstBlock = lines.findIndex((l) => l.startsWith("<!-- md-signature"));
  assert.ok(touches(spans, text.length, text.length));
  assert.ok(touches(spans, starts[firstBlock]! + 5, starts[firstBlock]! + 5));
  const free = lines.findIndex((l, i) => (i < open || (i > close && i < firstBlock)) && l.trim() !== "" && !l.startsWith("<!--"));
  assert.ok(free >= 0);
  assert.ok(!touches(spans, starts[free]! + 1, starts[free]! + 1));
});

test("editing outside the sections keeps scoped signatures valid", async () => {
  const keys = JSON.parse(readFileSync(new URL("./examples/keys.json", import.meta.url), "utf8"));
  const text = ex("valid-scoped-edited.md");
  const { spans, starts, lines } = spansFor(text);
  const target = lines.findIndex((l, i) => l.trim() !== "" && !touches(spans, starts[i]!, starts[i]! + l.length));
  const at = starts[target]! + lines[target]!.length;
  const edited = text.slice(0, at) + " (edited here)" + text.slice(at);
  const r = await verifyDocument(edited, { offline: true, now: new Date(keys.now) });
  assert.ok(r.signatures.length > 0);
  assert.ok(r.signatures.every((s) => s.code !== "hash-mismatch" && s.status !== "invalid"), JSON.stringify(r.signatures.map((s) => [s.status, s.code])));
});

test("model and summary follow the verification result", async () => {
  setLang("ja");
  const text = ex("tampered.md");
  const r = await verifyDocument(text, { offline: true });
  const m = buildModel(t, { text, online: false, result: r, layout: layout(text) }, false);
  assert.equal(summarize(r), "failed");
  assert.equal(m.seal.tone, "bad");
  assert.ok(m.cards.some((c) => c.status === "この署名の後に文書が変更されています"));
  assert.ok(m.brackets.length >= 1);
});

test("unsigned text after the last signature is shown as a tail", () => {
  const text = ex("unsigned-trailer.md");
  const l = layout(text);
  assert.ok(l.tail);
  assert.equal(locks(l).kind, "free");
});

test("gpg colon output gives signing keys with emails", () => {
  const colons = [
    "sec:u:255:22:AAAA:1700000000:::u:::scESC:::+:::23::0:",
    "fpr:::::::::0123456789ABCDEF0123456789ABCDEF01234567:",
    "uid:u::::1700000000::HASH::Frank Example <Frank@Example.com>::::::::::0:",
    "ssb:u:255:18:BBBB:1700000000::::::e:::+:::cv25519::",
    "fpr:::::::::FFFF456789ABCDEF0123456789ABCDEF01234567:",
  ].join("\n");
  const keys = parseGpgSecretKeys(colons);
  assert.equal(keys.length, 1);
  assert.equal(keys[0]!.fpr, "0123456789ABCDEF0123456789ABCDEF01234567");
  assert.equal(keys[0]!.keyAlg, "ed25519");
  assert.deepEqual(keys[0]!.emails, ["frank@example.com"]);
});

test("armored gpg signatures are decoded", () => {
  const raw = new Uint8Array([0x88, 0x75, 1, 2, 3]);
  const armored = `-----BEGIN PGP SIGNATURE-----\n\n${btoa(String.fromCharCode(...raw))}\n=abcd\n-----END PGP SIGNATURE-----\n`;
  assert.deepEqual(dearmorSignature(new TextEncoder().encode(armored)), raw);
  assert.deepEqual(dearmorSignature(raw), raw);
});
