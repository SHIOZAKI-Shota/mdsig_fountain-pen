import type { BlockResult } from "@mdsig/core";
import type { Entry } from "./entry.ts";
import { mark, methodLabel, signerLabel, statusText, summarize, summaryText, summaryTone, tone, type T, type Tone } from "./present.ts";
import type { LineRange } from "./ranges.ts";

export interface Row {
  line: number | null;
  text: string;
  kind: "body" | "head" | "blank" | "block" | "edge" | "gap" | "tail";
  block?: number;
  hidden?: number;
}

export interface Bracket {
  index: number;
  tone: Tone;
  from: number;
  to: number;
  label: string;
  dashed?: boolean;
}

export interface Card {
  index: number;
  tone: Tone;
  mark: string;
  status: string;
  signer: string;
  method: string;
  role?: string;
  rows: [string, string][];
  line: number;
  keyChanged: boolean;
}

export interface Step {
  label: string;
  done: boolean;
  members: { text: string; done: boolean }[];
}

export interface ViewModel {
  rows: Row[];
  brackets: Bracket[];
  seal: { tone: Tone; mark: string; title: string; detail: string };
  cards: Card[];
  steps: Step[];
  online: boolean;
}

const CLIP = 160;

function keepLines(e: Entry, full: boolean): Set<number> | null {
  if (full) return null;
  const keep = new Set<number>();
  const lines = e.text.replace(/\r\n?/g, "\n").split("\n");
  const add = (from: number, to: number) => {
    for (let l = Math.max(1, from); l <= Math.min(e.layout.lineCount, to); l++) keep.add(l);
  };
  if (e.layout.body) {
    add(1, 4);
    add(e.layout.body.to - 1, e.layout.body.to + 1);
  }
  for (const c of e.layout.coverage) for (const r of c.ranges) {
    add(r.from, r.from + 1);
    add(r.to - 1, r.to);
  }
  for (const b of e.layout.blocks) {
    add(b.from, b.from);
    add(b.to, b.to + 1);
    for (let l = b.from; l <= b.to; l++) if (/^(method|signer|role|scope|require): /.test(lines[l - 1] ?? "")) keep.add(l);
  }
  if (e.layout.tail) add(e.layout.tail.from, e.layout.tail.to);
  if (e.layout.strayBlock) {
    add(e.layout.strayBlock.from, e.layout.strayBlock.from);
    add(e.layout.strayBlock.to, e.layout.strayBlock.to);
    for (let l = e.layout.strayBlock.from; l <= e.layout.strayBlock.to; l++) if (/^(method|signer|role): /.test(lines[l - 1] ?? "")) keep.add(l);
  }
  return keep;
}

export function buildModel(t: T, e: Entry, full: boolean): ViewModel {
  const lines = e.text.replace(/\r\n?/g, "\n").split("\n");
  const blockAt = new Map<number, number>();
  for (const b of e.layout.blocks) for (let l = b.from; l <= b.to; l++) blockAt.set(l, b.index);
  if (e.layout.strayBlock) for (let l = e.layout.strayBlock.from; l <= e.layout.strayBlock.to; l++) blockAt.set(l, -1);
  const keep = keepLines(e, full);
  const rows: Row[] = [];
  let skipped = 0;
  const flush = () => {
    if (skipped > 0) rows.push({ line: null, text: "", kind: "gap", hidden: skipped });
    skipped = 0;
  };
  for (let l = 1; l <= e.layout.lineCount; l++) {
    if (keep && !keep.has(l) && !(keep.has(l - 1) && keep.has(l + 1))) {
      skipped++;
      continue;
    }
    flush();
    const raw = lines[l - 1] ?? "";
    const text = raw.length > CLIP ? raw.slice(0, CLIP) + "…" : raw;
    const block = blockAt.get(l);
    const inTail = e.layout.tail && l >= e.layout.tail.from && l <= e.layout.tail.to;
    const kind: Row["kind"] = block ? (/^(<!-- md-signature|-->)/.test(raw) ? "edge" : "block") : inTail ? "tail" : /^\s*$/.test(raw) ? "blank" : /^#{1,6} /.test(raw) ? "head" : "body";
    rows.push({ line: l, text, kind, ...(block ? { block } : {}) });
  }
  flush();

  const status = new Map(e.result.signatures.map((s) => [s.index, s]));
  const brackets: Bracket[] = [];
  for (const c of e.layout.coverage) {
    const s = status.get(c.index);
    for (const r of c.ranges) {
      brackets.push({
        index: c.index,
        tone: s ? tone(s) : "muted",
        ...r,
        label: c.sections ? t("#{0} covers {1}", c.index, c.sections.join(", ")) : c.index > 2 ? t("#{0} covers this (with #1 to #{1})", c.index, c.index - 1) : c.index === 2 ? t("#{0} covers this (with #1)", c.index) : t("#{0} covers this", c.index),
      });
    }
  }
  if (e.layout.tail) brackets.push({ index: 0, tone: "bad", ...e.layout.tail, label: t("No signature covers this"), dashed: true });

  const k = summarize(e.result);
  const sum = summaryText(t, e.result);
  const cards = e.result.signatures.map((s) => card(t, s, e.layout.blocks.find((b) => b.index === s.index)));
  return {
    rows,
    brackets,
    seal: { tone: summaryTone(k), mark: k === "verified" ? "✓" : k === "pending" ? "…" : k === "offline" || k === "unsigned" ? "−" : k === "incomplete" ? "?" : "✗", title: sum.title, detail: sum.detail },
    cards,
    steps: steps(t, e),
    online: e.online,
  };
}

function card(t: T, s: BlockResult, span: LineRange | undefined): Card {
  const f = s.fields;
  const rows: [string, string][] = [];
  const add = (k: string, v: string | undefined) => v && rows.push([k, v]);
  add(t("Reason"), f.reason);
  add(t("Signed at (claimed)"), f.ts);
  add(t("Timestamp"), s.tsa?.verified ? `${s.tsa.genTime}` : s.tsa ? t("present, not verified") : undefined);
  add(t("Key from"), s.key?.source ?? (s.pgp?.keySource ? `OpenPGP ${s.pgp.fpr ?? ""} (${s.pgp.keySource})` : undefined));
  add(t("Passkey"), s.webauthn ? `rp_id ${s.webauthn.rpId}${s.webauthn.userVerified ? "" : ` (${t("user not verified")})`}` : undefined);
  add(t("Expires"), f.expires);
  add(t("Covers"), s.partial ? s.partial.sections.join(", ") : undefined);
  if (s.message && s.status !== "valid") add(t("Details"), s.message);
  return { index: s.index, tone: tone(s), mark: mark(s), status: statusText(t, s), signer: signerLabel(s), method: methodLabel(t, f.method), ...(f.role ? { role: f.role } : {}), rows, line: span?.from ?? 1, keyChanged: s.code === "key-changed" };
}

function steps(t: T, e: Entry): Step[] {
  const a = e.result.agreement;
  if (a.status === "none") return [];
  const key = (r: { declaredBy: number; step: number }) => `${r.declaredBy}|${r.step}`;
  const missing = new Set(a.missing.map((m) => `${key(m)}|${m.method}:${m.signer}|${m.role ?? ""}`));
  const groups = new Map<string, { step: number; any: number; members: Step["members"] }>();
  for (const r of a.required) {
    const g = groups.get(key(r)) ?? { step: r.step, any: r.any, members: [] };
    g.members.push({ text: `${r.signer}${r.role ? ` (${r.role})` : ""}`, done: !missing.has(`${key(r)}|${r.method}:${r.signer}|${r.role ?? ""}`) });
    groups.set(key(r), g);
  }
  const many = new Set([...groups.values()].map((g) => g.step)).size > 1;
  return [...groups.values()].map((g) => ({
    label: g.members.length > g.any ? t("Step {0}: {1} of these", g.step, g.any) : many ? t("Step {0}", g.step) : "",
    done: g.members.filter((m) => m.done).length >= g.any,
    members: g.members,
  }));
}
