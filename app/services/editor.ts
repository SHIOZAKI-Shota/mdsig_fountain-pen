import { Annotation, EditorState, RangeSet, RangeSetBuilder, StateField, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, highlightActiveLine, highlightSpecialChars, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { layout } from "../lib/ranges.ts";
import { locks, lockedSpans, touches, type Locks, type Span } from "../lib/locks.ts";
import { HIDDEN_CHARS, codePoint } from "../lib/findings.ts";

export const external = Annotation.define<boolean>();

interface LockState {
  locks: Locks;
  spans: Span[];
}

function compute(state: EditorState): LockState {
  const lk = locks(layout(state.doc.toString()));
  const n = state.doc.lines;
  const spans = lockedSpans(lk, (l) => state.doc.line(Math.min(Math.max(l, 1), n)).from, (l) => state.doc.line(Math.min(Math.max(l, 1), n)).to, state.doc.length);
  return { locks: lk, spans };
}

export const lockField = StateField.define<LockState>({
  create: compute,
  update: (v, tr) => (tr.docChanged ? compute(tr.state) : v),
});

const lockedLine = Decoration.line({ class: "cm-locked" });

const lockDecorations = EditorView.decorations.compute([lockField], (state) => {
  const b = new RangeSetBuilder<Decoration>();
  const { spans } = state.field(lockField);
  const lines = new Set<number>();
  for (const s of spans) {
    const a = state.doc.lineAt(s.from).number;
    const z = state.doc.lineAt(Math.min(s.to, state.doc.length)).number;
    for (let l = a; l <= z; l++) lines.add(l);
  }
  for (const l of [...lines].sort((x, y) => x - y)) {
    const line = state.doc.line(l);
    b.add(line.from, line.from, lockedLine);
  }
  return b.finish() as DecorationSet;
});

class LockMarker extends GutterMarker {
  override toDOM() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "10");
    svg.setAttribute("height", "10");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z");
    p.setAttribute("fill", "currentColor");
    svg.append(p);
    return svg;
  }
}
const lockMarker = new LockMarker();

const lockGutter = gutter({
  class: "cm-lock-gutter",
  markers: (view) => {
    const b = new RangeSetBuilder<GutterMarker>();
    const { spans } = view.state.field(lockField);
    const seen = new Set<number>();
    for (const s of [...spans].sort((x, y) => x.from - y.from)) {
      const a = view.state.doc.lineAt(s.from).number;
      const z = view.state.doc.lineAt(Math.min(s.to, view.state.doc.length)).number;
      for (let l = a; l <= z; l++) {
        if (seen.has(l)) continue;
        seen.add(l);
        const line = view.state.doc.line(l);
        b.add(line.from, line.from, lockMarker);
      }
    }
    return b.finish() as RangeSet<GutterMarker>;
  },
});

// security: signed text must not change, so edits that touch a locked span are dropped before they apply
export const guard = EditorState.changeFilter.of((tr: Transaction) => {
  if (!tr.docChanged || tr.annotation(external)) return true;
  const { spans } = tr.startState.field(lockField);
  if (!spans.length) return true;
  let ok = true;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (touches(spans, fromA, toA)) ok = false;
  });
  return ok;
});

const style = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--ruri-text)" },
  { tag: tags.url, color: "var(--ruri-text)" },
  { tag: tags.comment, color: "var(--muted)" },
  { tag: tags.monospace, color: "var(--ink-2)" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
  { tag: tags.quote, color: "var(--ink-2)" },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--paper)", color: "var(--ink)" },
  ".cm-content": { caretColor: "var(--ink)", padding: "14px 0 40vh" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--paper-2) 70%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--ruri-soft) !important" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
});

export function editorExtensions(text: string, onChange: (text: string) => void, onBlocked: () => void): Extension[] {
  return [
    EditorState.lineSeparator.of(text.includes("\r\n") ? "\r\n" : "\n"),
    lineNumbers(),
    highlightSpecialChars({
      specialChars: new RegExp(HIDDEN_CHARS.source, "g"),
      render: (code) => {
        const s = document.createElement("span");
        s.className = "cm-hidden-char";
        s.textContent = `⟨${codePoint(String.fromCodePoint(code))}⟩`;
        s.title = codePoint(String.fromCodePoint(code));
        return s;
      },
    }),
    lockField,
    lockGutter,
    lockDecorations,
    guard,
    history(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    markdown(),
    syntaxHighlighting(style),
    EditorView.lineWrapping,
    // security: signed text must be exactly what was typed, so no autocorrect, smart quotes, or capitalization
    EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off", writingsuggestions: "false", translate: "no" }),
    theme,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorState.transactionFilter.of((tr) => {
      if (tr.docChanged && !tr.annotation(external)) {
        const { spans } = tr.startState.field(lockField);
        let blocked = false;
        tr.changes.iterChangedRanges((a, b) => {
          if (touches(spans, a, b)) blocked = true;
        });
        if (blocked) queueMicrotask(onBlocked);
      }
      return tr;
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) onChange(u.state.doc.toString());
    }),
  ];
}
