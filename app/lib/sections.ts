import { findSections, parseDocument } from "@mdsig/core";

const lf = (s: string) => s.replace(/\r\n?/g, "\n");

export const SECTION_ID = /^[a-z0-9-]+$/;

export type SectionError = "bad-id" | "duplicate-id" | "overlap" | "signature-area" | "empty";

export interface SectionPlan {
  open: string;
  close: string;
  text: string;
}

export function suggestSectionId(text: string, fromLine: number, toLine: number): string {
  const all = lf(text).split("\n");
  const title = (l: string | undefined) => (l === undefined ? undefined : /^#{1,6}\s+(.*)$/.exec(l)?.[1]);
  let heading = all.slice(fromLine - 1, toLine).map(title).find(Boolean) ?? "";
  for (let i = fromLine - 2; !heading && i >= 0; i--) heading = title(all[i]) ?? "";
  const existing = new Set(findSections(lf(text)).sections.keys());
  let base = heading
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (!base) base = "section";
  if (!existing.has(base)) return base;
  for (let i = 2; ; i++) if (!existing.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function planSection(text: string, fromLine: number, toLine: number, id: string, lineBreak = "\n"): SectionPlan | { error: SectionError } {
  if (!SECTION_ID.test(id)) return { error: "bad-id" };
  const before = findSections(lf(text));
  if (before.sections.has(id)) return { error: "duplicate-id" };
  const lines = text.split(/\r?\n/);
  if (lines.slice(fromLine - 1, toLine).every((l) => l.trim() === "")) return { error: "empty" };
  const doc = parseDocument(text);
  const first = doc.chain[0];
  if (first && toLine >= first.line) return { error: "signature-area" };
  const open = `<!-- mdsig:section ${id} -->`;
  const close = "<!-- /mdsig:section -->";
  const out = [...lines.slice(0, fromLine - 1), open, ...lines.slice(fromLine - 1, toLine), close, ...lines.slice(toLine)].join(lineBreak);
  const after = findSections(lf(out));
  const added = after.sections.get(id);
  if (after.errors.length > before.errors.length || !added || added.line !== fromLine || after.sections.size !== before.sections.size + 1) return { error: "overlap" };
  if (parseDocument(out).chain.length !== doc.chain.length) return { error: "signature-area" };
  return { open, close, text: out };
}
