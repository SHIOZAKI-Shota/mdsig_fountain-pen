import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { guard, lockField, external } from "../app/services/editor.ts";

const ex = (n: string) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");
const make = (doc: string) => EditorState.create({ doc, extensions: [lockField, guard] });
const lineOf = (s: EditorState, prefix: string) => {
  for (let i = 1; i <= s.doc.lines; i++) if (s.doc.line(i).text.startsWith(prefix)) return s.doc.line(i);
  throw new Error(prefix);
};

test("whole-document signatures reject every edit", () => {
  const s = make(ex("valid-single.md"));
  assert.equal(s.update({ changes: { from: 0, insert: "x" } }).state.doc.toString(), s.doc.toString());
  assert.equal(s.update({ changes: { from: s.doc.length, insert: "x" } }).state.doc.toString(), s.doc.toString());
});

test("scoped documents accept edits outside the sections only", () => {
  const s = make(ex("valid-scoped-edited.md"));
  const free = lineOf(s, "Kick-off");
  assert.notEqual(s.update({ changes: { from: free.to, insert: " ok" } }).state.doc.toString(), s.doc.toString());
  const signed = lineOf(s, "Payment within");
  assert.equal(s.update({ changes: { from: signed.from + 2, insert: "x" } }).state.doc.toString(), s.doc.toString());
  const marker = lineOf(s, "<!-- mdsig:section terms");
  assert.equal(s.update({ changes: { from: marker.from, insert: "x" } }).state.doc.toString(), s.doc.toString());
  assert.equal(s.update({ changes: { from: marker.from - 1, to: marker.from } }).state.doc.toString(), s.doc.toString());
  assert.equal(s.update({ changes: { from: lineOf(s, "# Statement").from, to: signed.to } }).state.doc.toString(), s.doc.toString());
  assert.equal(s.update({ changes: { from: s.doc.length, insert: "tail" } }).state.doc.toString(), s.doc.toString());
});

test("replacing the document from outside is allowed", () => {
  const s = make(ex("valid-single.md"));
  assert.equal(s.update({ changes: { from: 0, to: s.doc.length, insert: "new" }, annotations: external.of(true) }).state.doc.toString(), "new");
});

test("an unsigned document is fully editable", () => {
  const s = make("# Draft\n");
  assert.equal(s.update({ changes: { from: 0, insert: "x" } }).state.doc.toString(), "x# Draft\n");
});
