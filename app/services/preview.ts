import DOMPurify from "dompurify";
import { Marked } from "marked";
import { HIDDEN_CHARACTER_RE, findSignatureMarker, parseDocument } from "@mdsig/core";

const HIDDEN_ONE = new RegExp(HIDDEN_CHARACTER_RE.source, "u");
import type { Entry } from "../lib/entry.ts";
import { declaredName, mark, methodLabel, signerLabel, statusText, tone } from "../lib/present.ts";
import { signatureRows, type TableRow } from "../lib/model.ts";
import { t } from "../lib/i18n.ts";
import { REMOVED_TAGS, codePoint as cp, isSectionMarker, isSignatureMarker, linkMismatch } from "../lib/findings.ts";

// security: document content must not style, name or script anything outside its own text
const SANITIZE = {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  FORBID_TAGS: [...REMOVED_TAGS],
  FORBID_ATTR: ["style", "class", "id", "name", "for", "hidden", "role", "tabindex", "slot", "usemap", "popover", "popovertarget", "popovertargetaction", "color", "bgcolor", "background", "face", "srcset", "sizes", "download", "contenteditable", "draggable", "inert", "target"],
  RETURN_DOM_FRAGMENT: true as const,
};

const COMMENT = /<!--([\s\S]*?)-->/g;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const codePoint = (c: string) => `⟨${cp(c)}⟩`;

let removedMarker: ((tag: string) => string) | null = null;
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  const tag = data.tagName?.toLowerCase();
  if (removedMarker && tag && REMOVED_TAGS.has(tag) && node.parentNode) node.parentNode.insertBefore(document.createTextNode(removedMarker(tag)), node);
});

function markChars(text: string, show: boolean): Node[] {
  if (!show) return [document.createTextNode(text)];
  const out: Node[] = [];
  let last = 0;
  for (const m of text.matchAll(HIDDEN_CHARACTER_RE)) {
    if (m.index! > last) out.push(document.createTextNode(text.slice(last, m.index)));
    const s = el("span", "char", codePoint(m[0]));
    s.title = t("Invisible character");
    out.push(s);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

const SLOT = "sigtable-slot";

function renderMarkdown(src: string, show: boolean, tableSlot = false): DocumentFragment {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const comments: string[] = [];
  let slot = tableSlot;
  const token = new RegExp(`\\uE000${nonce}:(\\d+|r:[a-z0-9-]+|s:[A-Za-z0-9_.-]+|m:t)\\uE001`, "g");
  const md = new Marked({
    gfm: true,
    renderer: {
      checkbox: ({ checked }) => (checked ? "☑ " : "☐ "),
      html: ({ text }) =>
        text.replace(COMMENT, (_m, body: string) => {
          if (isSectionMarker(body)) {
            const id = /^mdsig:section\s+(\S+)$/.exec(body.trim())?.[1];
            return id ? `\uE000${nonce}:s:${id}\uE001` : "";
          }
          if (slot && isSignatureMarker(body)) {
            slot = false;
            return `\uE000${nonce}:m:t\uE001`;
          }
          comments.push(body.trim());
          return `${nonce}:${comments.length - 1}`;
        }),
    },
  });
  removedMarker = (tag) => `\uE000${nonce}:r:${tag}\uE001`;
  let frag: DocumentFragment;
  try {
    frag = DOMPurify.sanitize(md.parse(src, { async: false }) as string, SANITIZE) as DocumentFragment;
  } finally {
    removedMarker = null;
  }
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const node of texts) {
    const s = node.data;
    if (!s.includes("\uE000") && !(show && HIDDEN_ONE.test(s))) continue;
    const parts: Node[] = [];
    let last = 0;
    for (const m of s.matchAll(token)) {
      if (m.index! > last) parts.push(...markChars(s.slice(last, m.index), show));
      if (m[1] === "m:t") {
        parts.push(el("span", SLOT));
      } else if (m[1]!.startsWith("s:")) {
        const label = el("span", "section-label", m[1]!.slice(2));
        label.title = t("Section {0}", m[1]!.slice(2));
        parts.push(label);
      } else if (m[1]!.startsWith("r:")) {
        const note = el("span", "removed-note", t("Removed element <{0}>", m[1]!.slice(2)));
        note.title = t("This element is in the source but is not shown in the preview for safety");
        parts.push(note);
      } else if (show) {
        const note = el("span", "hidden-note");
        note.title = t("This comment is not shown when rendered, but it is part of what is signed");
        note.append(el("b", "", t("Hidden comment")), ...markChars(comments[Number(m[1])] ?? "", true));
        parts.push(note);
      }
      last = m.index! + m[0].length;
    }
    if (last < s.length) parts.push(...markChars(s.slice(last), show));
    node.replaceWith(...parts);
  }
  for (const a of frag.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    a.setAttribute("rel", "noopener noreferrer");
    a.setAttribute("title", href);
    const actual = linkMismatch(a.textContent ?? "", href);
    if (actual) {
      const dest = el("span", "link-dest", `→ ${actual}`);
      dest.title = t("The link goes somewhere other than its text suggests");
      a.after(dest);
    }
  }
  for (const img of frag.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (!/^(?:https?:)?\/\//i.test(src)) continue;
    const ph = el("span", "ext-image", `${t("External image (not loaded)")}: ${src}`);
    img.replaceWith(ph);
  }
  return frag;
}

function sliceLines(text: string, from: number, to: number): string {
  return text.split("\n").slice(from - 1, to).join("\n");
}

function signatureTable(rows: TableRow[]): HTMLElement {
  const box = el("section", "sig-table preview-table");
  box.setAttribute("aria-label", t("Signature table"));
  box.append(el("p", "note", t("The signature table this document asks for, built from the verification result. It is not part of the signed text.")));
  const table = el("table");
  const head = el("tr");
  for (const h of ["#", t("Signer"), t("Method"), t("Role"), t("Timestamp"), t("Status")]) head.append(el("th", "", h));
  table.append(head);
  for (const r of rows) {
    const tr = el("tr");
    const who = el("td");
    if (r.name) who.append(el("span", "declared", r.name));
    who.append(el("span", "signer", r.signer));
    tr.append(el("td", "idx", r.number), who, el("td", "", r.method), el("td", "", r.role), el("td", "mono", r.time), el("td", `t-${r.tone}`, r.status));
    table.append(tr);
  }
  box.append(table);
  return box;
}

// security: the table goes between the body parts, outside the sanitized DOM; the body cannot forge the slot because class attributes are stripped
function splitAtSlot(frag: DocumentFragment): [Node[], Node[]] | null {
  const slot = frag.querySelector(`span.${SLOT}`);
  if (!slot) return null;
  let top: ChildNode = slot;
  while (top.parentNode && top.parentNode !== frag) top = top.parentNode as unknown as ChildNode;
  const nodes = [...frag.childNodes];
  const i = nodes.indexOf(top);
  const before = nodes.slice(0, i);
  const after = nodes.slice(i + 1);
  slot.remove();
  if (top.textContent?.trim()) before.push(top);
  return [before, after];
}

export function renderPreview(text: string, e: Entry | null, show: boolean): DocumentFragment {
  const doc = parseDocument(text);
  const out = document.createDocumentFragment();
  const first = doc.chain[0];
  const l = e?.layout;
  const bodyEnd = first ? first.line - 1 : l?.strayBlock ? l.strayBlock.from - 1 : l?.tail ? l.tail.from - 1 : Infinity;
  const body = bodyEnd === Infinity ? doc.text : sliceLines(doc.text, 1, bodyEnd);
  const rows = e && first && findSignatureMarker(body).line !== undefined ? signatureRows(t, e) : null;
  const frag = renderMarkdown(body, show, !!rows);
  const parts = rows ? splitAtSlot(frag) : null;
  if (rows && parts) {
    const [before, after] = parts;
    const a = el("div", "md");
    a.append(...before);
    out.append(a, signatureTable(rows));
    if (after.length) {
      const b = el("div", "md");
      b.append(...after);
      out.append(b);
    }
  } else {
    const wrap = el("div", "md");
    wrap.append(frag);
    out.append(wrap);
  }
  if (e && first) {
    for (const s of e.result.signatures) {
      const p = el("p", `sigrow ${`t-${tone(s)}`}`);
      p.append(el("span", "mk", mark(s)), el("span", "idx", `#${s.index}`));
      const name = declaredName(t, s);
      if (name) p.append(el("span", "declared", name));
      p.append(el("b", "", signerLabel(s)));
      if (s.fields.role) p.append(el("span", "badge", s.fields.role));
      p.append(el("span", "", methodLabel(t, s.fields.method)));
      if (s.time) p.append(el("span", "time", `⏱ ${s.time.at}`));
      p.append(el("span", "st", statusText(t, s)));
      out.append(p);
    }
  }
  if (l?.tail) {
    out.append(el("p", "tail-note", t("No signature covers the following text")));
    const tail = el("div", "md tail");
    tail.append(renderMarkdown(sliceLines(doc.text, l.tail.from, l.tail.to), show));
    out.append(tail);
  }
  return out;
}
