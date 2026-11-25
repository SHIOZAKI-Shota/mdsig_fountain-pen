import type { Layout, LineRange } from "./ranges.ts";

export type LockKind = "free" | "scoped" | "full";

export interface Locks {
  kind: LockKind;
  lines: LineRange[];
  toEnd: number | null;
}

export function locks(l: Layout): Locks {
  if (l.blocks.length === 0) return { kind: "free", lines: [], toEnd: null };
  if (l.coverage.some((c) => c.sections === null)) return { kind: "full", lines: [], toEnd: null };
  const lines = l.coverage.flatMap((c) => c.ranges).sort((a, b) => a.from - b.from);
  return { kind: "scoped", lines, toEnd: l.blocks[0]!.from };
}

export interface Span {
  from: number;
  to: number;
}

export function lockedSpans(lk: Locks, lineStart: (n: number) => number, lineEnd: (n: number) => number, length: number): Span[] {
  if (lk.kind === "full") return [{ from: 0, to: length }];
  const out: Span[] = lk.lines.map((r) => ({ from: lineStart(r.from), to: lineEnd(r.to) }));
  if (lk.toEnd !== null) out.push({ from: lineStart(lk.toEnd), to: length });
  return out;
}

export function touches(spans: Span[], from: number, to: number): boolean {
  return spans.some((s) => from <= s.to && to >= s.from);
}
