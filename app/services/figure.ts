import type { Bracket, Row, ViewModel } from "../lib/model.ts";
import { t } from "../lib/i18n.ts";

const LH = 20;
export const hue = (index: number, tone: string) => (tone === "ok" && index > 0 ? `t-ok c-${((index - 1) % 4) + 1}` : `t-${tone}`);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function spans(rows: Row[]): [number, number][] {
  const out: [number, number][] = [];
  let prev = 0;
  for (const r of rows) {
    if (r.line !== null) {
      out.push([r.line, r.line]);
      prev = r.line;
    } else {
      out.push([prev + 1, prev + (r.hidden ?? 0)]);
      prev += r.hidden ?? 0;
    }
  }
  return out;
}

function rowRange(sp: [number, number][], b: Bracket): [number, number] | null {
  let from = -1;
  let to = -1;
  sp.forEach(([lo, hi], i) => {
    if (from < 0 && hi >= b.from) from = i;
    if (lo <= b.to) to = i;
  });
  return from >= 0 && to >= from ? [from, to] : null;
}

export function figure(m: ViewModel): HTMLElement {
  const fig = el("div", "fig");
  const body = el("div", "body");
  const list = el("ol", "lines");
  for (const r of m.rows) {
    const li = el("li", `k-${r.kind}`);
    if (r.kind === "gap") {
      li.textContent = `⋯ ${t("{0} lines", r.hidden ?? 0)}`;
    } else {
      li.dataset.ln = String(r.line);
      li.textContent = r.text || " ";
      if (r.block) li.className += ` blk ${r.block < 0 ? "t-bad" : hue(r.block, m.cards.find((c) => c.index === r.block)?.tone ?? "muted")}`;
    }
    list.append(li);
  }
  const marks = el("div", "marks");
  const sp = spans(m.rows);
  const order = [...m.brackets].sort((a, b) => (a.index || 1e9) - (b.index || 1e9));
  const step = 22;
  const labelX = 12 + (order.length - 1) * step + 14;
  let lastLabelRow = -10;
  const labelled = new Set<number>();
  order.forEach((b, k) => {
    const rr = rowRange(sp, b);
    if (!rr) return;
    const br = el("span", `br ${hue(b.index, b.tone)}${b.dashed ? " dashed" : ""}`);
    br.style.top = `${rr[0] * LH}px`;
    br.style.height = `${(rr[1] - rr[0] + 1) * LH}px`;
    br.style.width = `${12 + k * step}px`;
    br.title = b.label;
    marks.append(br);
    if (!(b.index && labelled.has(b.index))) {
      labelled.add(b.index);
      let row = Math.round((rr[0] + rr[1]) / 2);
      if (row - lastLabelRow < 2) row = lastLabelRow + 2;
      lastLabelRow = row;
      const lab = el("span", `lab ${hue(b.index, b.tone)}`);
      lab.style.top = `${row * LH}px`;
      lab.style.left = `${labelX}px`;
      if (b.index) lab.append(el("b", "", `#${b.index}`), document.createTextNode(" "));
      lab.append(document.createTextNode(b.index ? b.label.replace(`#${b.index} `, "") : b.label));
      marks.append(lab);
    }
  });
  marks.style.width = `${labelX + 210}px`;
  body.append(list, marks);
  fig.append(body);
  return fig;
}
