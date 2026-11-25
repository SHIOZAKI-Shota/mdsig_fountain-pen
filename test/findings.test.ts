import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanBody, linkMismatch, countByKind } from "../app/lib/findings.ts";

const ex = (n: string) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");
const kinds = (s: string) => scanBody(s).map((f) => `${f.kind}@${f.line}`);

test("plain documents have no findings", () => {
  assert.deepEqual(scanBody("# Title\n\nJust [text](https://example.com).\n"), []);
  assert.deepEqual(scanBody(ex("valid-single.md")), []);
});

test("signature blocks and section markers are not findings", () => {
  assert.deepEqual(scanBody(ex("valid-scoped-edited.md")), []);
  assert.deepEqual(scanBody(ex("valid-cosigned.md")), []);
});

test("hidden comments are found with their lines", () => {
  const f = scanBody("# T\n\nPay 100.\n\n<!-- and also 1,000,000 -->\n\nInline <!-- x --> here.\n");
  assert.deepEqual(f.map((x) => [x.kind, x.line, x.text]), [["comment", 5, "and also 1,000,000"], ["comment", 7, "x"]]);
});

test("comments inside code are visible and not reported", () => {
  assert.deepEqual(scanBody("```\n<!-- shown -->\n```\n\n`<!-- also -->`\n"), []);
});

test("raw HTML, removed elements, invisible characters, definitions, links, and images", () => {
  const src = [
    "# T",
    "",
    'See <span hidden>secret</span> and <script>x()</script>.',
    "",
    "Right‮left and zero​width.",
    "",
    "[ref]: https://hidden.example",
    "",
    "[https://bank.example](https://evil.example/login) and ![logo](https://img.example/a.png)",
    "",
    '<img src="https://track.example/p.gif">',
  ].join("\n");
  assert.deepEqual(kinds(src), ["html@3", "removed@3", "chars@5", "chars@5", "linkdef@7", "link@9", "image@9", "html@11", "image@11"]);
  const grouped = countByKind(scanBody(src)).map(([k, l]) => [k, l.length]);
  assert.deepEqual(grouped, [["removed", 1], ["html", 2], ["chars", 2], ["linkdef", 1], ["link", 1], ["image", 2]]);
});

test("link text is compared with the real host", () => {
  assert.equal(linkMismatch("www.example.com", "https://example.com/x"), null);
  assert.equal(linkMismatch("example.com", "https://example.net/"), "example.net");
  assert.equal(linkMismatch("click here", "https://example.net/"), null);
  assert.equal(linkMismatch("example.com", "javascript:alert(1)"), "javascript:");
});
