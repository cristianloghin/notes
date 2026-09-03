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
src/core/    core       (types.ts, id.ts, markdown.ts, reducer.ts, store.ts,
                        sortkey.ts, doc.ts)

src/index.ts — the public surface; the only module consumers import from.
```

- **Core** is pure TypeScript: no React, no DOM, no browser globals. The
  reducer is the product; `NoteStore` is its thin observable wrapper —
  state lives in the instance, components subscribe. Consumers create the
  instance and hand it to `NoteProvider`; nothing else is threaded through
  props. The store's `onAction(fn): unsubscribe` registration is the
  SINGLE edits-out seam (rows-changing dispatches only, never caret-only
  updates or external pushes, fired after subscribers); `connect(source):
  unsubscribe` is the data-in channel, with `applyExternal(rows)` as its
  primitive and the reconciliation living in core beside the reducer
  (`applyExternalRows` — caret placement has one owner). The store does
  not serialize; string-grain hosts call
  `serialize(store.getState().rows)`.
- **Binding** owns exactly five jobs: providing the store through context
  (`useSyncExternalStore`), managing store lifecycle (`useNoteStore`
  constructs and disposes with the owning component), binding the store's
  consumer seams to React state (`useOnRowsChange`, `useOnAction`),
  translating DOM input events into actions, and applying `state.focus`
  to the DOM (the focus contract, spec §6). It computes nothing about documents or carets itself.
  Dispatches from discrete events flush subscribers synchronously, so the
  focus contract's same-call-stack guarantee survives the store
  indirection.
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
- `useNoteStore` — constructs a store bound to the owning component's
  lifetime (disposal included; StrictMode-safe)
- `useOnRowsChange`, `useOnAction` — React bindings of the edits-out
  seam: mapper/fold in, client-shaped React state out; edits only, no
  external pushes. `useOnRowsChange` is the rows-only projection of
  `onAction` — persistence seam, not a view feed; views derive from
  `useNote().state`.
- `Editor`, `Toolbar`
- `parseMarkdown`, `serialize` — markdown interchange, ids regenerated
- `parseDoc`, `serializeDoc`, `mergeDoc` — the JSON persistence codec
  (§4a); id-preserving, unlike markdown
- `keyBetween`, `keysBetween`, `isValidKey` — fractional sort keys, so a
  host adapter can mint a key for a row it inserts
- The types: `Row`, `RowId`, `GenId`, `Caret`, `State`, `Action` (and row
  variants, `ToolbarRenderProps`, `EditorRowRenderProps`, `FieldProps`,
  `CheckboxProps`, `NoteDoc`, `DocRow`, `DocAttrs`, `DocRowPatch`,
  `NotePatch`)

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
3. **Action observation** — *done 2026-08-08*:
   `onAction(fn): unsubscribe` fires for every dispatched action that
   changed rows, with the action and both row snapshots, so an adapter
   translates edits into targeted host writes without diffing. No
   caret-only actions, no external pushes; order per dispatch is
   subscribers → onAction. Listeners see the action as dispatched —
   internal delegation is not exposed. (An earlier `onRowsChange`
   registration was merged into this seam per §7.5 — third review,
   finding 2; `useOnRowsChange` survives as its React rows-projection.)
4. **External updates** — *done 2026-08-08*: `store.connect(source):
   unsubscribe` registers a host data feed; initial load and live updates
   arrive through one push channel. `applyExternal(rows)` is the
   underlying primitive; reconciliation lives in core
   (`applyExternalRows`, beside the reducer — caret placement has one
   owner) and preserves focus by row id with a clamped, model-origin
   caret (settled decisions 1–3 hold); echo pushes that equal current
   rows are ignored. External pushes notify subscribers but **never fire
   `onAction`** — edits-out and pushes-in are different events;
   conflating them makes echo loops through the host's persistence.
   `dispose()` runs outstanding connection cleanups; React consumers get
   lifecycle via `useNoteStore`. Conflict ordering and mid-edit deferral
   policy stay host-side (Planner's edit guards).

Host-side contracts (the host's job, documented here so the library never
absorbs them): commit debouncing, edit-session guards (Planner's
`beginEdit`/`endEdit`), theming via the host's own skin and tokens.

## 4a. The JSON storage shape

*Added 2026-09-03.* Markdown is interchange, not persistence (settled
decision 7), so until now every host had to write its own id-preserving
codec. `src/core/doc.ts` is that codec, and `src/core/sortkey.ts` is the
ordering primitive under it.

The stored shape is split **by lifecycle, not by the row union**:

```json
{
  "rows":  { "b": { "type": "item", "text": "screws", "sort": "a1" } },
  "attrs": { "done": { "b": true } }
}
```

- `rows` — authored content, id-keyed, merge-patchable.
- `attrs.<namespace>` — sparse per-row state. Absent means default;
  explicit `false` is how an override unchecks what its base checked.
  `done` is the only namespace the library reads; host namespaces
  (assignee, dueOn) pass through `serializeDoc` untouched, which is where
  the §4 "metadata does not enter the core model" rule meets storage.
- `sort` — a fractional index on each row, so there is no positional
  array anywhere and *every* operation, insertion and reorder included,
  is expressible as a JSON merge patch. This is what lets a stored
  override change structure without cloning the note body.

Rules that follow, and where they are owned:

1. **`type` is authoritative; `attrs.done` is read only for item rows.**
   That makes an entry which outlives its item type harmless rather than
   corrupting a prose row — but it is tolerance, not memory. The reducer
   *drops* `done` on a type change, so a host must clear the entry in the
   same patch: storage never resurrects state the model discarded. (The
   first draft of this rule claimed the opposite; `demo/storage/patch.ts`
   disagreed with the reducer until a test caught it, 2026-09-03.)
2. **`parseDoc` is tolerant, `keyBetween` is strict.** Independent
   overrides routinely compose into partial rows, so parsing fills
   defaults, orders unusable sort keys last, and collapses newlines
   (§2.6) rather than dropping data. Minting a key from garbage is a
   programming error and throws.
3. **Sort-key ties break by row id**, so two overrides that mint the same
   key are a tie every reader resolves identically — not a conflict.
4. **Referential integrity is the codec's job**, not the format's:
   `parseDoc` ignores attrs naming absent rows, `serializeDoc` collects
   them.
5. **This shape is storage, never the model.** `Row[]` stays flat and
   array-shaped; the reducer, the focus contract and `applyExternalRows`
   would all pay a join for the normalization and gain nothing. The two
   representations meet in `doc.ts` and nowhere else.

Hosts writing incrementally do not call `serializeDoc` at all — they
derive patches from `onAction`. It exists for creating a document, and
for rebalancing keys that have grown long under heavy patching (call it
without `previous`).

## 5. Open findings

Still open, with disposition (details in the reviewer's memory,
`review-open-findings-notes.md`):

- **Reveal policy in the binding** — *partially addressed 2026-08-08*: the
  iOS opacity blink is removed (obsolete since the static-layout redesign
  made Safari's focus-reveal pan the desired behavior); `scrollIntoView`
  and autosize remain in the binding, `scrollIntoView` gated by
  `scrollOnFocus`. Full move-to-skin still open; do before any second skin.
- ~~**`beforeinput` wired via ref-callback expando**~~ — *resolved
  2026-08-08, forced by a production bug*: the attach-once listeners held
  the first store's dispatch, so `useNoteStore`'s StrictMode remount
  (store swap) stranded the soft-keyboard Enter/Backspace/dictation paths
  on a disposed instance. Now one delegated native listener on the
  container `Editor` owns, resolving the row id from `data-row-id` and
  reading the handler from a ref at event time — a store swap can never
  strand it. Lesson recorded: attach-once DOM listeners closing over
  swappable dependencies are bugs waiting for a swap.
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

Resolved 2026-08-08 (third review): external-push reconciliation moved
into core (`applyExternalRows` — caret placement has one owner; its
focus tests live in `reducer.test.ts` per house rule); `sameRows` moved
beside the `Row` union; `onRowsChange` merged into `onAction` as the
single edits-out seam, `useOnRowsChange` remaining as its React
rows-projection with repositioned docs (persistence seam, not a view
feed — the demo's document view now derives from `useNote().state`);
`source` constructor option replaced by `connect(source): unsubscribe`;
store lifecycle owned by the binding (`useNoteStore` constructs and
disposes; the StrictMode caveat is deleted, not documented); hook
seeding contracts unified (both take `initial`).

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

## 7. API design principles

How the owner judges this package's surface. Violations are findings on
the same level as layer direction — review consumer code (the demo, and
eventually Planner's adapter) against these, not just `src/`.

1. **Consumer code is the spec.** The API is judged by what the calling
   code looks like. If consuming a capability requires repeated wiring —
   effect-plus-registration blocks, subscription calls whose return value
   is discarded, threading store data through props — the surface is
   missing a piece. Close the gap in the library; never document the
   boilerplate as the pattern.
2. **Two audiences, two complete layers.** React consumers get the
   ergonomic layer (render-prop components, hooks); non-React hosts (e.g.
   Planner's store layer) get the primitive layer (`applyExternal`, raw
   registrations). "Hide the plumbing" applies per audience — the
   primitives are not clutter, they are the other audience's surface.
3. **React observes; it never owns.** State lives in the store instance.
   Data flows in through `source`/`applyExternal` and out through
   registrations — never through React props or component state. This is
   what makes external updates unable to clobber the document.
4. **The consumer contributes pure functions only** — mappers, folds,
   render props, adapters, id factories: data in, data out. Lifecycle,
   wiring, and invariants are the library's job, in both directions
   across the boundary.
5. **One obvious way.** No duplicate paths, no convenience aliases: a
   second way to reach the same data or perform the same operation is a
   finding, even when each path is individually reasonable (precedents:
   `useNoteStore`/`useNoteState` → `useNote`; `toMarkdown` removed in
   favor of `serialize`; raw reducer un-exported).
