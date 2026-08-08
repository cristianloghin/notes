# Architecture

Structural rules for this repository. The product spec —
[checklist-editor-spec.md](checklist-editor-spec.md) — defines *what* the
library does; this document defines *how the code is allowed to be shaped*.
The architecture reviewer judges changes against both: the spec for intent,
this file for boundaries. When the two disagree, flag it — don't silently
pick one.

## 1. Layers

Three layers, dependencies point strictly downward:

```
demo/       skin        (App.tsx, styles.css, main.tsx — outside the package)
    │
src/lib/    binding     (useChecklist.ts, Editor.tsx, Toolbar.tsx, index.ts)
    │
src/lib/    core        (types.ts, id.ts, markdown.ts, reducer.ts)
```

- **Core** is pure TypeScript: no React, no DOM, no browser globals. The
  reducer is the product; everything else is delivery.
- **Binding** owns exactly two jobs: translating DOM input events into
  actions, and applying `state.focus` to the DOM (the focus contract,
  spec §6). It computes nothing about documents or carets itself.
- **Skin** owns presentation: layout, theming, viewport/keyboard handling,
  toolbar markup. The demo skin is a reference consumer, not part of the
  library — it lives outside `src/` and imports only from `src/lib/index.ts`,
  never from individual lib modules.
- `Toolbar` is a headless binding-layer component: it derives the command
  surface (`setRowType`, `moveRow`, active row) and owns the §6 pointerdown
  guard on its container; a render-prop child owns every pixel.
- `Editor` is its counterpart for the editor body: it maps rows to a
  render-prop child and owns the keyed-by-row-id invariant (spec §7) and
  the container's list semantics; all row markup is the child's.

Nothing in `lib/` may import from `demo/`. Nothing in core may import from
the binding. Violations of direction are always findings, never judgment
calls.

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

Declared in `src/lib/index.ts`:

- `useChecklist`, `Editor`, `Toolbar`, `reducer`, `createInitialState`
- `parseMarkdown`, `serialize`
- The types: `Row`, `RowId`, `Caret`, `State`, `Action` (and row variants,
  `ToolbarRenderProps`, `EditorRowRenderProps`, `FieldProps`,
  `CheckboxProps`)

`id.ts` is an implementation detail and stays private. The `Action` union
has deliberately drifted from spec §10 (`promoteHeader`, `pasteText`,
`caret`/`offsetEnd` fields); reconcile the spec at the next revision rather
than the code — the drift is earned.

## 4. General-purpose stance and host integration

The library is host-agnostic. **No host-specific code — naming, schema
assumptions, data fetching, persistence — may appear in `src/lib/`.**
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

1. `src/lib/index.ts` — declared surface (§3).
2. **Injectable id factory** — `useChecklist({ genId })` so a host can mint
   DB-compatible ids at row creation. Also resolves the reducer-purity
   finding: the default factory stays, but the reducer's determinism is the
   host's choice.
3. **Action observation** — `onAction(action, prevRows, nextRows)` so an
   adapter can translate edits into host writes without diffing.
4. **External updates / controlled mode** — accepting host-side row changes
   (e.g. realtime edits from another device) without clobbering local focus
   and caret. Design constraint: the reconciliation must preserve settled
   decisions 1–3.

Host-side contracts (the host's job, documented here so the library never
absorbs them): commit debouncing, edit-session guards (Planner's
`beginEdit`/`endEdit`), theming via the host's own skin and tokens.

## 5. Open findings

From the 2026-08 architecture review, still open, with disposition:

- **(3) Rendering concerns in the binding** — autosize, `CSS.supports`
  probe, `scrollIntoView`. *Accepted direction:* move to skin; keyboard
  avoidance gets exactly one owner. Do before adding any second skin.
- **(5) No `lib/index.ts`** — *resolved*: `src/lib/index.ts` declares the
  surface and the demo consumes only it.
- **(6) `beforeinput` wired via ref-callback expando** — *accepted
  direction:* one delegated listener via `getContainerProps`.
- **(7) Non-deterministic ids in the reducer** — *superseded* by the
  injectable id factory (§4.2).

Findings 1, 2, 4 from that review are resolved (see settled decisions 1–4).

## 6. House rules

- Every reducer case that returns `focus` states *where the caret lands* —
  behavior changes there require a test in `reducer.test.ts`.
- New input paths (key, IME, paste, dictation, autofill) are guilty until
  proven: assume they can deliver multi-line text and composition states.
- The demo skin may use library internals freely but must remain deletable:
  if removing `src/demo/` would break `src/lib/`, the boundary has been
  violated.
- Spec §11 open questions get answered in the spec (or here), not implied
  by code.
