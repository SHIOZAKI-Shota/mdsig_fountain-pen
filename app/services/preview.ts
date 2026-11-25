import DOMPurify from "dompurify";
import { Marked } from "marked";
import { parseDocument } from "@mdsig/core";
import type { Entry } from "../lib/entry.ts";
import { mark, methodLabel, signerLabel, statusText, tone } from "../lib/present.ts";
import { t } from "../lib/i18n.ts";
import { HIDDEN_CHARS, REMOVED_TAGS, codePoint as cp, isSectionMarker, linkMismatch } from "../lib/findings.ts";

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
  for (const m of text.matchAll(HIDDEN_CHARS)) {
    if (m.index! > last) out.push(document.createTextNode(text.slice(last, m.index)));
    const s = el("span", "char", codePoint(m[0]));
    s.title = t("Invisible character");
    out.push(s);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function renderMarkdown(src: string, show: boolean): DocumentFragment {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const comments: string[] = [];
  const token = new RegExp(`\\uE000${nonce}:(\\d+|r:[a-z0-9-]+|s:[A-Za-z0-9_.-]+)\\uE001`, "g");
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
    if (!s.includes("\uE000") && !(show && HIDDEN_CHARS.test(s))) continue;
    HIDDEN_CHARS.lastIndex = 0;
    const parts: Node[] = [];
    let last = 0;
    for (const m of s.matchAll(token)) {
      if (m.index! > last) parts.push(...markChars(s.slice(last, m.index), show));
      if (m[1]!.startsWith("s:")) {
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

export function renderPreview(text: string, e: Entry | null, show: boolean): DocumentFragment {
  const doc = parseDocument(text);
  const out = document.createDocumentFragment();
  const first = doc.chain[0];
  const l = e?.layout;
  const bodyEnd = first ? first.line - 1 : l?.strayBlock ? l.strayBlock.from - 1 : l?.tail ? l.tail.from - 1 : Infinity;
  const body = bodyEnd === Infinity ? doc.text : sliceLines(doc.text, 1, bodyEnd);
  const wrap = el("div", "md");
  wrap.append(renderMarkdown(body, show));
  out.append(wrap);
  if (e && first) {
    for (const s of e.result.signatures) {
      const p = el("p", `sigrow ${`t-${tone(s)}`}`);
      p.append(el("span", "mk", mark(s)), el("span", "idx", `#${s.index}`), el("b", "", signerLabel(s)));
      if (s.fields.role) p.append(el("span", "badge", s.fields.role));
      p.append(el("span", "", methodLabel(t, s.fields.method)), el("span", "st", statusText(t, s)));
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
