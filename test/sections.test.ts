import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSections, verifyDocument } from "@mdsig/core";
import { planSection, suggestSectionId } from "../app/lib/sections.ts";

const ex = (n: string) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");
const doc = "# Contract\n\n## Fees\nMonthly 100 USD.\n\n## Notes\nFree text.\n";

test("wraps the selected lines in section markers", () => {
  const p = planSection(doc, 3, 4, "fees");
  assert.ok(!("error" in p));
  assert.equal(p.text, "# Contract\n\n<!-- mdsig:section fees -->\n## Fees\nMonthly 100 USD.\n<!-- /mdsig:section -->\n\n## Notes\nFree text.\n");
  assert.equal(findSections(p.text).sections.get("fees")?.line, 3);
});

test("keeps CRLF line breaks", () => {
  const crlf = doc.replace(/\n/g, "\r\n");
  const p = planSection(crlf, 3, 4, "fees", "\r\n");
  assert.ok(!("error" in p) && p.text.includes("<!-- mdsig:section fees -->\r\n## Fees"));
});

test("rejects bad, duplicate, overlapping, and empty selections", () => {
  assert.deepEqual(planSection(doc, 3, 4, "Fees"), { error: "bad-id" });
  const once = planSection(doc, 3, 4, "fees");
  assert.ok(!("error" in once));
  assert.deepEqual(planSection(once.text, 9, 10, "fees"), { error: "duplicate-id" });
  assert.deepEqual(planSection(once.text, 4, 5, "inner"), { error: "overlap" });
  assert.deepEqual(planSection(once.text, 5, 9, "around"), { error: "overlap" });
  assert.deepEqual(planSection(doc, 2, 2, "blank"), { error: "empty" });
});

test("markers inside a code block are refused", () => {
  const code = "# T\n\n```\ncode line\n```\n";
  assert.deepEqual(planSection(code, 4, 4, "code"), { error: "overlap" });
});

test("signature blocks cannot be wrapped", () => {
  const text = ex("valid-scoped-edited.md");
  const lines = text.split("\n");
  const block = lines.findIndex((l) => l.startsWith("<!-- md-signature")) + 1;
  assert.deepEqual(planSection(text, block, block + 2, "sig"), { error: "signature-area" });
});

test("a new section outside signed sections keeps scoped signatures valid", async () => {
  const keys = JSON.parse(readFileSync(new URL("./examples/keys.json", import.meta.url), "utf8"));
  const text = ex("valid-scoped-edited.md");
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("Kick-off")) + 1;
  const p = planSection(text, at, at, "notes");
  assert.ok(!("error" in p));
  const r = await verifyDocument(p.text, { offline: true, now: new Date(keys.now) });
  assert.ok(r.signatures.every((s) => s.code !== "hash-mismatch" && s.status !== "invalid" && s.status !== "malformed"));
});

test("suggests an ID from the first heading", () => {
  assert.equal(suggestSectionId(doc, 3, 4), "fees");
  assert.equal(suggestSectionId(doc, 7, 7), "notes");
  assert.equal(suggestSectionId("Intro only.\n", 1, 1), "section");
  const once = planSection(doc, 3, 4, "fees");
  assert.ok(!("error" in once));
  assert.equal(suggestSectionId(once.text, 4, 5), "fees-2");
  assert.equal(suggestSectionId("## 料金\n", 1, 1), "section");
});
