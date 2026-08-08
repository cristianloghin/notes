---
name: review-open-findings-notes
description: Open architecture findings from the 2026-08-08 third review of Notes (src/ + §7 consumer assessment), with dispositions
metadata:
  type: project
---

Findings the user has acted on or accepted are recorded by the user in
`docs/architecture.md` §2 and §5 — that file is the single copy, never
duplicated here. Delete a finding from this file the moment it lands there.

## Second review (2026-08-08) — final dispositions

Acted on: (2) genId threaded through parser/reducer/store, (3) onRowsChange
→ registration + unsubscribe, (4) reducer/createInitialState un-exported,
(7) `toMarkdown` deleted. (1) partially — the iOS opacity blink is gone;
`scrollIntoView`/autosize remain in `bindings.ts`. (5) beforeinput expando
and (6) Toolbar derivations: **accepted direction, not yet done** — now
recorded in architecture.md §5, so they are the user's copy, not mine.
Cut item (`useNote` returns whole state) was also adopted into §5 as
deferred.

## Third review, 2026-08-08 (post source/onAction/hooks + §7). Dispositions: unknown.

1. **Caret placement has a second owner:** `store.ts` `applyExternal`
   computes focus (id match, clamp, model origin) — spec line 121 and
   settled decisions 1–3 put that in the reducer; its tests live in
   `store.test.ts:149-171`, bypassing house rule §6. Fix: a pure core
   function/reducer case; the store keeps only the "never fire
   onRowsChange" rule. `sameRows` (store.ts:14-28) re-encodes the Row union
   and belongs beside `Row` for the same reason.
2. **`onRowsChange` and `onAction` fire on the identical condition**
   (`next.rows !== prev.rows`) and onAction's `nextRows` is a superset —
   §7.5 duplicate path; every future store capability must be mirrored.
3. **`useOnRowsChange` holds React copies that external pushes never
   refresh** (pushes skip rowsListeners), so the demo's MD/Planner panels
   go stale after a partner push — §7.3.
4. **Store construction/disposal is the consumer's job**, with the
   StrictMode caveat written into the class docstring; `dispose()` has no
   caller outside tests — §7.1 "never document the boilerplate".
5. **`source`'s `push` IS `applyExternal`** (store.ts:99): two inbound
   paths, and `source` is the only channel that is a constructor option
   instead of a registration returning unsubscribe. The demo pays for it
   with a `pushRef`.
6. **The two hooks seed differently** (`map(rows, undefined)` vs an
   `initial` argument), so consumers write `previous ?? FALLBACK`.

**Why:** these shape Planner's real adapter and controlled mode; 1 and 2
get more expensive the moment a second inbound/outbound capability lands.

**How to apply:** re-derive from the code before restating any of these. If
one is gone, say whether the *code* changed (retire, quote what went) or my
*judgement* did (record as a reversal, keep both readings). Related:
[[project-governing-spec]], [[feedback-review-scope]].
