import { Lexer, type Token, type Tokens } from "marked";
import { findHiddenCharacters, parseDocument } from "@mdsig/core";

export type FindingKind = "comment" | "html" | "removed" | "chars" | "linkdef" | "link" | "image";

export interface Finding {
  kind: FindingKind;
  line: number;
  text: string;
}

export const KIND_ORDER: FindingKind[] = ["comment", "removed", "html", "chars", "linkdef", "link", "image"];

export const REMOVED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "label", "option", "optgroup", "fieldset", "legend", "datalist", "output", "meter", "progress", "dialog", "template", "audio", "video", "source", "track", "picture", "map", "area", "noscript", "link", "meta", "base", "frame", "frameset", "svg", "math"]);

const COMMENT = /<!--([\s\S]*?)-->/g;
const SECTION_MARKER = /^(?:mdsig:section [a-z0-9-]+|\/mdsig:section)$/;
const OPEN_TAG = /<([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/g;
const IMG_SRC = /<img\b[^>]*\bsrc\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi;
const DOMAIN = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})/i;

export const codePoint = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
const clip = (s: string, n = 80) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
};
const nl = (s: string) => s.match(/\n/g)?.length ?? 0;
const host = (h: string) => h.toLowerCase().replace(/^www\./, "");

export function isSectionMarker(commentBody: string): boolean {
  return SECTION_MARKER.test(commentBody.trim());
}

export function isSignatureMarker(commentBody: string): boolean {
  return commentBody.trim() === "mdsig:signatures";
}

export function linkMismatch(text: string, href: string): string | null {
  const shown = DOMAIN.exec(text)?.[1];
  if (!shown) return null;
  let actual: string;
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol;
    actual = u.hostname;
  } catch {
    return null;
  }
  return host(shown) === host(actual) ? null : actual;
}

function children(t: Token): Token[] {
  const out: Token[] = [];
  const any = t as Token & { tokens?: Token[]; items?: Tokens.ListItem[]; header?: Tokens.TableCell[]; rows?: Tokens.TableCell[][] };
  if (any.tokens) out.push(...any.tokens);
  if (any.items) out.push(...any.items);
  if (any.header) for (const c of any.header) out.push(...c.tokens);
  if (any.rows) for (const r of any.rows) for (const c of r) out.push(...c.tokens);
  return out;
}

function scanHtml(raw: string, line: number, out: Finding[]) {
  const at = (i: number) => line + nl(raw.slice(0, i));
  let onlyComments = raw;
  for (const m of raw.matchAll(COMMENT)) {
    onlyComments = onlyComments.replace(m[0], "");
    if (isSectionMarker(m[1]!) || isSignatureMarker(m[1]!)) continue;
    out.push({ kind: "comment", line: at(m.index!), text: clip(m[1]!) || "(empty)" });
  }
  const rest = raw.replace(COMMENT, (c) => " ".repeat(c.length));
  for (const m of rest.matchAll(OPEN_TAG)) {
    const tag = m[1]!.toLowerCase();
    out.push({ kind: REMOVED_TAGS.has(tag) ? "removed" : "html", line: at(m.index!), text: clip(m[0], 60) });
  }
  for (const m of rest.matchAll(IMG_SRC)) out.push({ kind: "image", line: at(m.index!), text: m[1]! });
}

export function scanBody(input: string): Finding[] {
  const doc = parseDocument(input);
  const first = doc.chain[0];
  const body = first ? doc.text.slice(0, first.start) : doc.text;
  const out: Finding[] = [];
  for (const h of findHiddenCharacters(body)) if (h.context === null) out.push({ kind: "chars", line: h.line, text: h.codePoint });
  const walk = (tokens: Token[], top: Token, topLine: number) => {
    let cursor = 0;
    for (const t of tokens) {
      const idx = top.raw.indexOf(t.raw, cursor);
      const line = idx >= 0 ? topLine + nl(top.raw.slice(0, idx)) : topLine;
      if (idx >= 0) cursor = idx + t.raw.length;
      visit(t, line);
    }
  };
  const visit = (t: Token, line: number) => {
    if (t.type === "code" || t.type === "codespan") return;
    if (t.type === "html") scanHtml(t.raw, line, out);
    else if (t.type === "def") out.push({ kind: "linkdef", line, text: clip(t.raw) });
    else if (t.type === "link") {
      const l = t as Tokens.Link;
      const actual = linkMismatch(l.text, l.href);
      if (actual) out.push({ kind: "link", line, text: `${clip(l.text, 40)} → ${l.href}` });
    } else if (t.type === "image") {
      const href = (t as Tokens.Image).href;
      if (/^(?:https?:)?\/\//i.test(href)) out.push({ kind: "image", line, text: href });
    }
    walk(children(t), t, line);
  };
  let line = 1;
  for (const t of Lexer.lex(body, { gfm: true })) {
    visit(t, line);
    line += nl(t.raw);
  }
  return out.sort((a, b) => a.line - b.line);
}

export function countByKind(f: Finding[]): [FindingKind, Finding[]][] {
  return KIND_ORDER.map((k) => [k, f.filter((x) => x.kind === k)] as [FindingKind, Finding[]]).filter(([, l]) => l.length > 0);
}
