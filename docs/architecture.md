# Architecture

Structural rules for this repository. The product spec —
[note-editor-spec.md](note-editor-spec.md) — defines *what* the
library does; this document defines *how the code is allowed to be shaped*.
The architecture reviewer judges changes against both: the spec for intent,
this file for boundaries. When the two disagree, flag it — don't silently
pick one.

## 1. Layers

Three layers, dependencies point strictly downward:

```
demo/        skin       (App.tsx, styles.css, main.tsx — outside the package)
    │
src/react/   binding    (context.tsx, bindings.ts, Editor.tsx, Toolbar.tsx)
    │
src/core/    core       (types.ts, id.ts, markdown.ts, reducer.ts, store.ts)

src/index.ts — the public surface; the only module consumers import from.
```

- **Core** is pure TypeScript: no React, no DOM, no browser globals. The
  reducer is the product; `NoteStore` is its thin observable wrapper —
  state lives in the instance, components subscribe. Consumers create the
  instance and hand it to `NoteProvider`; nothing else is threaded through
  props. The store's `onRowsChange(fn): unsubscribe` registration (rows
  changes only, never caret-only updates, fired after subscribers) is the
  integration seam a consumer app persists from — step one of the §4
  adapter roadmap. The store does not serialize; string-grain hosts call
  `serialize(store.getState().rows)`.
- **Binding** owns exactly three jobs: providing the store through context
  (`useSyncExternalStore`), translating DOM input events into actions, and
  applying `state.focus` to the DOM (the focus contract, spec §6). It
  computes nothing about documents or carets itself. Dispatches from
  discrete events flush subscribers synchronously, so the focus contract's
  same-call-stack guarantee survives the store indirection.
- **Skin** owns presentation: layout, theming, viewport/keyboard handling,
  toolbar markup. The demo skin is a reference consumer, not part of the
  library — it lives outside `src/` and imports only from `src/index.ts`,
  never from individual lib modules.
- `Toolbar` is a headless binding-layer component: it derives the command
  surface (`setRowType`, `moveRow`, active row) and owns the §6 pointerdown
  guard on its container; a render-prop child owns every pixel.
- `Editor` is its counterpart for the editor body: it maps rows to a
  render-prop child and owns the keyed-by-row-id invariant (spec §7) and
  the container's list semantics; all row markup is the child's.

Nothing in `src/` may import from `demo/`. Nothing in `src/core/` may
import from `src/react/`. Violations of direction are always findings,
never judgment calls.

## 2. Settled decisions

Recorded so they are not relitigated. Each was either specified up front or
earned through a bug.

1. **`state.focus` is the caret, not a focus request.** Every text edit
   carries the caret into state (`setText.caret`); user-driven caret moves
   sync passively into state via focus/select events. No action reads the
   DOM to learn the caret. This is what makes controlled mode possible
   later. (Architecture review 2026-08, finding 1.)
2. **Actions that can remount or detach the focused field must re-emit
   `focus` as a fresh object** — `move`, `setRowType`. Object identity is
   the signal the binding uses to re-apply focus; skipping it drops the iOS
   keyboard. Regression-tested in `reducer.test.ts`.
3. **The passive sync never reports non-collapsed selections**, and focus
   application is guarded (`applyingFocus`) and skipped when the DOM
   already matches. Re-applying a collapsed caret over a user selection
   breaks native text selection.
   Additionally, **DOM-originated focus (`origin: 'dom'`) is bookkeeping,
   never a placement request** — the view must not re-apply it. Re-applying
   clobbers Safari's in-flight tap caret placement and adds a scroll nudge
   on every tap (the "vertical jump"). Actions that re-emit focus (`move`,
   `setRowType`) strip the origin, turning it back into a request.
4. **One action, one job.** `setText` stores text + caret only. Multi-line
   input delegates to `pasteText`; `# ` promotion is its own action
   (`promoteHeader`), with the *trigger* detected in the binding and the
   *conversion* owned by the reducer — the same division as Enter → `split`.
5. **Backspace-at-zero is detected on keydown first, `beforeinput` as
   Android-IME fallback.** `beforeinput` alone cannot work: browsers don't
   fire it for a deletion that would be a no-op.
6. **Rows never contain newlines.** Any path that could introduce one
   (dictation, IME commits, paste) must route through the parser.
7. **Markdown is an interchange format, not the internal model.** Round-trip
   is lossless for text/structure but regenerates ids (spec §8). Therefore
   markdown must never be used as a persistence bridge by a host that needs
   stable item identity — see §4.

## 3. Public surface

Declared in `src/index.ts`:

- `NoteStore`, `NoteProvider`, `useNote`
- `Editor`, `Toolbar`
- `parseMarkdown`, `serialize`
- The types: `Row`, `RowId`, `GenId`, `Caret`, `State`, `Action` (and row
  variants, `ToolbarRenderProps`, `EditorRowRenderProps`, `FieldProps`,
  `CheckboxProps`)

`reducer` and `createInitialState` are deliberately NOT exported: the
`NoteStore` instance is the only supported state owner. Publishing the raw
reducer would create a second ownership path that every future store
capability (action observation, external updates) would have to duplicate.

`useChecklist` is gone: the hook owned state, DOM glue, and API surface in
one closure, which forced prop-threading into every component. The store
instance + context split replaced it (2026-08).

`id.ts` is an implementation detail and stays private. The `Action` union
has deliberately drifted from spec §10 (`promoteHeader`, `pasteText`,
`caret`/`offsetEnd` fields); reconcile the spec at the next revision rather
than the code — the drift is earned.

## 4. General-purpose stance and host integration

The library is host-agnostic. **No host-specific code — naming, schema
assumptions, data fetching, persistence — may appear in `src/`.**
Integration logic lives in the host as an adapter. This is a hard boundary
on the same level as layer direction.

The first planned consumer is the Planner app
(`~/Documents/_Projects/Planner`), which has two target surfaces:

- **String-grain hosts** (Planner's event-note attachments): the host treats
  the editor as a controlled component over one markdown string. This is
  the supported path today.
- **Row-grain hosts** (Planner's Lists: normalized `list_item` rows with
  stable DB ids, per-item assignee/deadline, links, FTS): the host adapts at
  the `Row[]`/`Action` level and must *not* pass through markdown (see
  settled decision 7). Per-item metadata beyond `text`/`done` is the host's
  UI in the host's gutter — it does not enter the core model.

Capabilities the library must grow to support row-grain adapters, in
dependency order (these supersede the vaguer "0.4 persistence adapters"
phase in the spec):

1. `src/index.ts` — declared surface (§3). *Done.*
2. **Injectable id factory** — *done*: `new NoteStore({ genId })`; the
   factory threads through `reducer`, `createInitialState`, and
   `parseMarkdown` (defaulted to the library's), so splits, pastes, and
   parses all mint through one path. Determinism is the host's choice.
3. **Action observation** — `onAction(action, prevRows, nextRows)` so an
   adapter can translate edits into host writes without diffing. Must be a
   registration (returning unsubscribe), like `subscribe`/`onRowsChange` —
   never a constructor option.
4. **External updates** — *done 2026-08-08*: `new NoteStore({ source })`
   subscribes the store to host pushes; initial load and live updates
   arrive through one channel. `applyExternal(rows)` is the underlying
   primitive; `dispose()` tears the subscription down. Reconciliation
   preserves focus by row id with a clamped, model-origin caret (settled
   decisions 1–3 hold); echo pushes that equal current rows are ignored.
   External pushes notify subscribers but **never fire `onRowsChange`** —
   edits-out and pushes-in are different events; conflating them makes
   echo loops through the host's persistence. Conflict ordering and
   mid-edit deferral policy stay host-side (Planner's edit guards).

Host-side contracts (the host's job, documented here so the library never
absorbs them): commit debouncing, edit-session guards (Planner's
`beginEdit`/`endEdit`), theming via the host's own skin and tokens.

## 5. Open findings

Still open, with disposition (details in the reviewer's memory,
`review-open-findings-notes.md`):

- **Reveal policy in the binding** — *partially addressed 2026-08-08*: the
  iOS opacity blink is removed (obsolete since the static-layout redesign
  made Safari's focus-reveal pan the desired behavior); `scrollIntoView`
  and autosize remain in the binding, `scrollIntoView` gated by
  `scrollOnFocus`. Full move-to-skin still open; do before any second skin.
- **`beforeinput` wired via ref-callback expando** — *accepted direction:*
  one delegated listener on the container `Editor` owns.
- **`Toolbar` derives document facts** (`activeRow`, `canMoveUp/Down`) —
  *accepted direction:* move the derivations to core as pure functions of
  `State` so row-grain hosts can reuse them.
- **`useNote` returns whole state** (every subscriber re-renders on every
  change) — *deferred* until it shows up in a host profiler.

Resolved 2026-08-08 (second review): injectable id factory threaded
through parser/reducer/store; `onRowsChange` as a registration returning
unsubscribe; `reducer`/`createInitialState` removed from the surface;
`NoteStore.toMarkdown` removed. First review's findings 1, 2, 4 →
settled decisions 1–4; finding 5 → `src/index.ts`; finding 7 → superseded
by the id factory.

## 6. House rules

- Every reducer case that returns `focus` states *where the caret lands* —
  behavior changes there require a test in `reducer.test.ts`.
- New input paths (key, IME, paste, dictation, autofill) are guilty until
  proven: assume they can deliver multi-line text and composition states.
- The demo skin may use library internals freely but must remain deletable:
  if removing `demo/` would break `src/`, the boundary has been
  violated.
- Spec §11 open questions get answered in the spec (or here), not implied
  by code.
