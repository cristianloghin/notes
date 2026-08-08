# Checklist Editor — Library Spec

> Working title. A mobile-first React library for fast entry of checklists grouped under headers.

**Status:** draft · **Target:** React 18+, TypeScript

---

## 1. Purpose

A component library for capturing checklists at speed on a phone. The defining
property is that a user can open it and produce a structured list of items —
grouped under headers, individually checkable — without their thumbs ever
leaving the keyboard.

Everything in this spec is subordinate to that: if a feature makes entry slower,
it does not ship.

### What "fast" means concretely

- Typing an item and pressing Return produces the next item, focused, ready.
- The software keyboard never dismisses during any operation.
- No toolbar round-trip is required for the common path.
- Checking an item does not steal focus or lose the caret.

## 2. Scope

### In scope (v1)

- Flat list of rows: headers, checklist items, and plain-text paragraphs
- Enter to create, Backspace to merge, arrow keys to traverse
- Toggle done state by tap
- Markdown-compatible serialization
- Headless core with an optional default skin

### Non-goals

| Excluded | Reason |
|---|---|
| Visual or feature parity with iPhone Notes | Only the entry speed was ever the point |
| Rich inline text (bold, links, inline code) | Requires a document model; kills the flat-string story |
| Nested sub-items | Deferred to v2; adds depth invariants and indent gestures |
| Undo/redo | Explicitly deprioritized; native per-field undo is adequate |
| Collaboration / CRDT sync | Out of scope; the serialized format is the integration point |
| Attachments, images, drawing | Not a Notes clone |

## 3. Rejected approaches

Recorded so they are not relitigated.

**Existing editor cores (Tiptap, Lexical, BlockNote).** All solve document
modelling, which is not the hard part here. They bring a document model heavier
than the domain needs, and their drag/handle affordances are hover-positioned
and desktop-first. Rejected as disproportionate.

**Single `<textarea>`, items derived from lines.** Excellent model story — one
string, trivial persistence, native editing throughout. Fails on checkboxes: a
textarea cannot host interactive elements, and `done` must become syntax rather
than state.

**Single `<textarea>` + mirror div (transparent text, styled overlay).**
Resolves the checkbox problem by hosting hit targets in the mirror. Rejected on
one hard constraint: the mirror can only apply styles that do not change
metrics. Headers may take weight and colour but never size or spacing, because
the textarea will not reflow to match and the caret drifts from that line
onward. Since headers exist precisely to look different, this cap is fatal.

**HTML `<table>`.** Gives per-row elements and free gutter alignment, and
multiple `<tbody>` elements map cleanly to sections. Rejected: assistive
technology announces tabular navigation for what is semantically a list;
dragging a `<tr>` collapses its cell widths; `contenteditable` inside cells is
unreliable across engines.

**Single `contenteditable` for the whole document.** Inherits browser-specific
Enter, paste, and IME behaviour. The worst-supported corner of the platform on
mobile.

**Two-mode editing (raw textarea ↔ rendered preview).** Genuinely viable and
cheaper than the mirror; unrestricted typography because the layers never
coexist. Rejected only because a tap to enter edit mode contradicts the speed
goal on the primary path.

**Selected: one field per row.** Styled text *is* the editable. Full typographic
freedom, real checkbox elements, no alignment invariant to maintain. Costs
selection spanning multiple rows and unified undo — both accepted.

## 4. Data model

Flat array. Sections are derived, never stored.

```ts
type RowId = string;

type Row =
  | { id: RowId; type: 'header'; text: string }
  | { id: RowId; type: 'item'; text: string; done: boolean }
  | { id: RowId; type: 'text'; text: string };

type Caret = { id: RowId; offset: number };

type State = {
  rows: Row[];
  focus: Caret | null;
};
```

A **section** is a header row plus every following row until the next header.
Derived on demand. Storing it would make reordering a tree operation instead of
index arithmetic.

### Invariants

- `rows` is never empty; an empty document holds one empty item.
- `id` is stable for the lifetime of a row and is never the array index.
- A header has no `done` state.
- Rows before the first header belong to an implicit untitled section.

## 5. Interaction spec

The reducer owns caret placement. The view never computes where focus lands.

| Trigger | Condition | Result | Caret lands |
|---|---|---|---|
| Enter | caret mid-text | split row; tail moves to a new row of the same type | new row, `0` |
| Enter | caret at end | insert empty row below, same type as current | new row, `0` |
| Enter | on a header | insert an **item** below (not another header) | new row, `0` |
| Enter | on an **empty item** | convert the row to a plain-text paragraph in place (double-Enter list exit) | same row, `0` |
| Backspace | `offset === 0`, previous row exists | append current text to previous; delete current | previous, at its pre-merge length |
| Backspace | `offset === 0`, current row empty | delete current row | previous, at end |
| Backspace | `offset === 0`, first row | no-op | unchanged |
| ArrowUp | `selectionStart === 0` | focus previous row | `min(column, prev.length)` |
| ArrowDown | `selectionStart === length` | focus next row | `min(column, next.length)` |
| Tap checkbox | row is an item | toggle `done` | unchanged, field retains focus |
| Paste | clipboard contains newlines | split into rows, parse markers (§8) | last inserted row, at end |

### Notes on specific rules

**Enter on a header inserts an item.** Consecutive headers are almost never
intended; the overwhelmingly common intent after naming a section is to start
filling it.

**Merge across a header boundary.** Backspace at offset 0 on the first item of a
section merges into the header text. Acceptable — it is how the user deletes an
unwanted header.

**Column memory on vertical movement** is clamped, not remembered across
multiple moves. A true goal-column implementation is disproportionate here.

## 6. Focus contract

The single most important behaviour in the library.

1. Every structural action returns `focus: Caret` as part of the new state.
2. The view applies it in `useLayoutEffect`, never in `useEffect`.
3. Focus transfers directly between fields. The previous field is **never**
   blurred first.
4. The update must remain inside the originating discrete event's call stack.

Point 4 is the one that breaks silently. On iOS the software keyboard survives a
focus change only when it happens within the gesture's synchronous call stack.
React flushes discrete events (keydown, pointerdown) synchronously, so a layout
effect triggered by them stays inside it. Anything that defers — `setTimeout`,
`requestAnimationFrame`, `startTransition`, `useDeferredValue` — drops the
keyboard.

```tsx
const refs = useRef(new Map<RowId, HTMLTextAreaElement>());

useLayoutEffect(() => {
  if (!focus) return;
  const el = refs.current.get(focus.id);
  if (!el) return;
  el.focus();
  el.setSelectionRange(focus.offset, focus.offset);
}, [focus]);
```

Any control that mutates state without being a text field — checkbox, section
handle, accessory button — must call `preventDefault()` on `pointerdown` so the
active field never blurs.

## 7. Rendering

- One `<textarea rows={1}>` per row, auto-grown to content height. Not
  `<input>`: long items must wrap rather than scroll horizontally.
- Auto-grow via `field-sizing: content` where supported, with a `scrollHeight`
  fallback.
- Rows keyed by `id`. Keying by index misplaces focus on the first reorder.
- Container as `display: grid` with `grid-template-columns: auto 1fr`; rows use
  `grid-template-columns: subgrid` so the checkbox gutter aligns across every
  section and wrapped lines hang under the text, not under the checkbox.
- Headers are free to differ in size, weight, and spacing. This is the entire
  reason for the chosen architecture.
- No virtualization. It conflicts with focus management and is unnecessary below
  a few thousand rows.

## 8. Serialization

Markdown-compatible. Round-trips losslessly apart from `id`, which is
regenerated on parse.

```markdown
# Hardware
- [ ] screws
- [x] hinges

# Paint
- [ ] primer
```

- `# ` prefix → header
- `- [ ] ` / `- [x] ` → item, unchecked/checked
- Any other non-empty line parses as a plain-text paragraph row, and
  paragraph rows serialize as bare lines
- Blank lines are not preserved as rows; spacing is presentational
- Known limitation: a paragraph whose text itself starts with `# ` or
  `- [ ] ` will re-parse as a header/item; markers are not escaped

Markers are ASCII and equal length (`- [ ] ` and `- [x] ` are both six
characters) so a toggle never changes the string's layout. Unicode ballot
glyphs are rejected: font-fallback metrics vary per line.

The parser is also the paste handler. Pasting multi-line text runs it directly.

## 9. Mobile constraints

- `enterKeyHint="next"` on item fields to relabel the return key.
- Detect Backspace-at-zero via `beforeinput` — `inputType ===
  'deleteContentBackward'` with `selectionStart === 0` — not keydown. Android
  soft keyboards report `keyCode 229` / `Unidentified` in composition states.
- Suppress structural handling between `compositionstart` and `compositionend`.
- Soft keyboards expose no arrow keys. Row traversal on a phone is Enter,
  Backspace, and tapping. Arrow handling serves hardware keyboards and iPad.
- Keep the focused row above the keyboard using `visualViewport`. Do not rely on
  the VirtualKeyboard API or `interactive-widget` — neither is available in
  Safari.
- Any drag affordance (v2) must originate from a non-editable gutter element
  with `user-select: none` and `-webkit-touch-callout: none`, to avoid colliding
  with the native long-press selection callout.

## 10. Public API

Headless core, presentation optional.

```ts
function useChecklist(options?: {
  initial?: Row[] | string;      // rows, or markdown source
  onChange?: (rows: Row[]) => void;
}): {
  rows: Row[];
  dispatch: (action: Action) => void;
  getRowProps: (id: RowId) => RowProps;
  getContainerProps: () => ContainerProps;
  toMarkdown: () => string;
};

type Action =
  | { type: 'setText'; id: RowId; text: string }
  | { type: 'split'; id: RowId; offset: number }
  | { type: 'mergeBackward'; id: RowId }
  | { type: 'remove'; id: RowId }
  | { type: 'toggleDone'; id: RowId }
  | { type: 'setRowType'; id: RowId; rowType: Row['type'] }
  | { type: 'move'; id: RowId; toIndex: number }
  | { type: 'focusRow'; id: RowId; offset: number };
```

The reducer ships as a standalone export — pure, DOM-free, and testable without
a renderer. Treat it as the product; the React bindings are a thin layer over
it.

## 11. Open questions

- Does checking an item move it to the bottom of its section, or stay in place?
- Collapsible sections — worth the state, or does it invite nesting?
- ~~Should an empty item plus Enter do anything special?~~ **Answered:** it
  converts the row to a plain-text paragraph — the double-Enter list exit.
- Section reordering: move the header and its derived range, or forbid it in v1?
- Does the default skin ship at all, or is the library headless-only?

## 12. Phasing

| Version | Contents |
|---|---|
| 0.1 | Reducer, `useChecklist`, focus contract, Enter/Backspace/arrows |
| 0.2 | Headers and derived sections, markdown parse/serialize, paste |
| 0.3 | Reorder — pointer-capture drag from a gutter handle |
| 0.4 | Persistence adapters, controlled mode, default skin |
| 1.0 | API freeze |
