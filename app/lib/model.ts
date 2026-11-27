import { findSignatureMarker, signatureTable, type BlockResult, type LineRange } from "@mdsig/core";
import type { Entry } from "./entry.ts";
import { coreText, declarationText, declaredName, mark, methodLabel, orderText, rejectText, requirementText, signerLabel, statusText, summarize, summaryMark, summaryText, summaryTone, timeText, tone, type T, type Tone } from "./present.ts";

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
  name?: string;
  rows: [string, string][];
  line: number;
  keyChanged: boolean;
}

export interface Step {
  label: string;
  done: boolean;
  members: { text: string; done: boolean; notes: string[] }[];
}

export interface Declaration {
  title: string;
  tone: Tone;
  status: string;
  notes: string[];
  steps: Step[];
}

export interface TableRow {
  number: string;
  name: string;
  signer: string;
  method: string;
  role: string;
  time: string;
  status: string;
  tone: Tone;
}

export interface ViewModel {
  rows: Row[];
  brackets: Bracket[];
  seal: { tone: Tone; mark: string; title: string; detail: string };
  cards: Card[];
  agreement: Declaration[];
  table: TableRow[] | null;
  warnings: string[];
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
    for (let l = b.from; l <= b.to; l++) if (/^(method|signer|display_name|role|scope|require): /.test(lines[l - 1] ?? "")) {
      keep.add(l);
      if (/: \|$/.test(lines[l - 1] ?? "")) for (let c = l + 1; c < b.to && /^  /.test(lines[c - 1] ?? ""); c++) keep.add(c);
    }
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
    seal: { tone: summaryTone(k), mark: summaryMark(k), title: sum.title, detail: sum.detail },
    cards,
    agreement: agreement(t, e),
    table: signatureRows(t, e),
    warnings: warnings(e),
    online: e.online,
  };
}

function card(t: T, s: BlockResult, span: LineRange | undefined): Card {
  const f = s.fields;
  const rows: [string, string][] = [];
  const add = (k: string, v: string | undefined) => v && rows.push([k, v]);
  add(t("Reason"), f.reason);
  add(t("Signed at (claimed)"), f.ts);
  add(t("Timestamp"), timeText(t, s) ?? (s.tsa && !s.tsa.verified ? t("present, not verified") : undefined));
  add(t("Key from"), s.key?.source ?? (s.pgp?.keySource ? `OpenPGP ${s.pgp.fpr ?? ""} (${s.pgp.keySource})` : undefined));
  add(t("Passkey"), s.webauthn ? passkeyText(t, s.webauthn) : undefined);
  add(t("Expires"), f.expires);
  add(t("Covers"), s.partial ? s.partial.sections.join(", ") : undefined);
  if (s.message && s.status !== "valid") add(t("Details"), coreText(s.message));
  for (const w of s.warnings) add(t("Note"), coreText(w));
  const name = declaredName(t, s);
  return { index: s.index, tone: tone(s), mark: mark(s), status: statusText(t, s), signer: signerLabel(s), method: methodLabel(t, f.method), ...(f.role ? { role: f.role } : {}), ...(name ? { name } : {}), rows, line: span?.from ?? 1, keyChanged: s.code === "key-changed" };
}

export function passkeyText(t: T, w: NonNullable<BlockResult["webauthn"]>): string {
  const parts = [`rp_id ${w.rpId}`, w.userVerified ? t("user verified") : t("user not verified")];
  parts.push(w.backedUp ? t("synced passkey") : w.backupEligible ? t("syncable passkey (not synced)") : t("device-bound passkey"));
  return parts.join(" · ");
}

function agreement(t: T, e: Entry): Declaration[] {
  const a = e.result.agreement;
  if (a.status === "none") return [];
  return a.declarations.map((d) => {
    const mine = a.required.filter((r) => r.declaredBy === d.declaredBy);
    const missing = new Map(a.missing.filter((m) => m.declaredBy === d.declaredBy).map((m) => [`${m.step}|${m.line}`, m]));
    const many = d.steps.length > 1;
    const steps: Step[] = d.steps.map((st) => {
      const members = mine
        .filter((r) => r.step === st.step)
        .map((r) => {
          const by = st.lines.find((l) => l.line === r.line)?.blocks ?? [];
          const m = missing.get(`${st.step}|${r.line}`);
          const notes = by.map((i) => t("signed by #{0}", i));
          if (m) notes.push(...m.rejected.map((x) => rejectText(t, x.index, x.reason)));
          if (m && st.blockedBy !== undefined) notes.push(t("waits for step {0}", st.blockedBy));
          return { text: requirementText(r), done: by.length > 0, notes };
        });
      const label = st.any !== null ? (many ? t("Step {0}: {1} of these", st.step, st.any) : t("{0} of these", st.any)) : many ? t("Step {0}", st.step) : "";
      return { label, done: st.complete, members };
    });
    const notes: string[] = [];
    const order = orderText(t, d.order);
    if (order) notes.push(order);
    for (const v of a.violations.filter((x) => x.declaredBy === d.declaredBy)) notes.push(t("#{0} signed before step {1} was reached", v.index, v.step));
    if (d.detail) notes.push(coreText(d.detail));
    const dtone: Tone = d.status === "complete" ? "ok" : d.status === "pending" || d.status === "undetermined" ? "warn" : "bad";
    return { title: t("Required by #{0}", d.declaredBy), tone: dtone, status: declarationText(t, d.status), notes, steps };
  });
}

export function signatureRows(t: T, e: Entry): TableRow[] | null {
  const first = e.layout.blocks[0];
  if (!first) return null;
  const body = e.text.replace(/\r\n?/g, "\n").split("\n").slice(0, first.from - 1).join("\n");
  if (findSignatureMarker(body).line === undefined) return null;
  return signatureTable(e.result).map((r) => {
    const s = r.number !== null ? e.result.signatures.find((x) => x.index === r.number) : undefined;
    return {
      number: r.number !== null ? `#${r.number}` : "",
      name: r.displayName ? t("“{0}” (self-declared)", r.displayName) : "",
      signer: r.pattern ? requirementText({ method: r.method, signer: r.signer, pattern: true, attributes: {} }) : r.signer,
      method: methodLabel(t, r.method),
      role: r.role ?? "",
      time: r.time ?? "",
      status: s ? `${mark(s)} ${statusText(t, s)}` : r.need ? t("Not signed yet ({0} needed)", r.need) : t("Not signed yet"),
      tone: s ? tone(s) : "muted",
    };
  });
}

function warnings(e: Entry): string[] {
  return e.result.warnings.map(coreText);
}
