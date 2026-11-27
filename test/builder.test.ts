import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRequire } from "@mdsig/core";
import { checkInput, signerId } from "../app/lib/input.ts";
import { draftFromSpec, emptyDraft, serializeDraft, type Draft } from "../app/lib/requireDraft.ts";
import { scanBody } from "../app/lib/findings.ts";
import { readFileSync } from "node:fs";
const read = (n: string) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");

test("a draft serializes to a require value that core reads back", () => {
  const d: Draft = {
    order: "guide",
    steps: [
      { any: "", lines: [{ method: "dns", signer: "example.com", role: "approver", userVerified: false, memberOf: "", pubkey: "" }] },
      {
        any: "2",
        lines: [
          { method: "dns", signer: "*.example.com", role: "witness", userVerified: true, memberOf: "dns:corp.example", pubkey: "" },
          { method: "tofu", signer: "bob@laptop", role: "", userVerified: false, memberOf: "", pubkey: "ed25519:/FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU=" },
        ],
      },
    ],
  };
  const text = serializeDraft(d);
  assert.equal(text, "order mode=guide\nstep\n  dns:example.com role=approver\nstep any=2\n  dns:*.example.com role=witness user_verified member_of=dns:corp.example\n  tofu:bob@laptop pubkey=ed25519:/FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU=");
  const p = parseRequire(text, 0);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(draftFromSpec(p.spec), d);
});

test("a single step without any= needs no step line", () => {
  const d = emptyDraft();
  d.steps[0]!.lines[0]!.signer = "example.com";
  assert.equal(serializeDraft(d), "dns:example.com");
  assert.equal(serializeDraft(emptyDraft()), "");
});

test("input checks use the canonical signer and report require problems", () => {
  assert.equal(signerId({ method: "git-hosting", signer: " github.com/Alice " }), "github.com/alice");
  assert.equal(signerId({ method: "tofu", signer: "Bob" }), "Bob");
  assert.equal(checkInput({ method: "dns", signer: "Example.COM." }, "en").signer, null);
  assert.ok(checkInput({ method: "dns", signer: "exa mple.com" }, "en").signer);
  const old = checkInput({ method: "dns", signer: "example.com", require: "dns:example.com approver" }, "en").require!;
  assert.equal(old.blocking, true);
  assert.equal(old.draft, null);
  assert.ok(old.errors.some((p) => p.includes("role=approver")));
  const ok = checkInput({ method: "dns", signer: "example.com", require: "step\n  dns:example.com role=approver\nstep\n  tofu:bob@laptop" }, "ja").require!;
  assert.equal(ok.blocking, false);
  assert.equal(ok.draft!.steps.length, 2);
  assert.ok(ok.explanation.includes("段階 1"));
  assert.ok(ok.warnings.some((w) => w.includes("pubkey=")));
  assert.ok(checkInput({ method: "dns", signer: "example.com", displayName: "a".repeat(65) }, "en").displayName);
});

test("the signature table marker is not reported as a hidden comment", () => {
  assert.deepEqual(scanBody(read("table-marker.md")).filter((f) => f.kind === "comment"), []);
  assert.equal(scanBody("# T\n\n<!-- mdsig:section Terms -->\n").filter((f) => f.kind === "comment").length, 1);
});
