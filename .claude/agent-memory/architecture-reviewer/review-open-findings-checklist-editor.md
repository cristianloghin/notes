---
name: review-open-findings-checklist-editor
description: Open architecture findings from the 2026-08-08 review of the checklist-editor POC, with dispositions
metadata:
  type: project
---

Findings reported 2026-08-08 (first review, whole `src/` tree). **All dispositions:
unknown** — none of these is a settled boundary. Re-derive each from the code before
restating it; do not quote this list as fact.

1. Caret ownership is split three ways — `State.focus` (reducer), `activeId`
   (`useState` in the hook), and the live DOM read by `caretIn`. `move` and `setRowType`
   return state without focus, so the hook re-dispatches `focusRow` with a DOM-read
   offset. Contradicts spec §5/§6.
2. `useChecklist` carries the demo's toolbar command layer (`activeId`,
   `toggleActiveHeader`, `moveActive`).
3. Presentation in the hook: textarea autosize (writes `style.height`), the
   `CSS.supports('field-sizing')` probe, and `scrollIntoView` — while the demo owns the
   other half of keyboard avoidance via `useVisualViewportBox`.
4. `setText` also re-parses multi-line text into rows and promotes `"# "` to a header.
5. No public entry module for `src/lib`; returned API and `Action` union have drifted
   from spec §10.
6. Row event wiring split between React props and an imperative `beforeinput` listener
   tagged with a `__clAttached` DOM expando, never removed.
7. (Note) `genId` is a module-level mutable counter called from inside the reducer, so
   the "pure" core is non-deterministic.

**Why:** these shape phases 0.3–1.0; each one costs more once drag-reorder and the
default skin land on the same seams.

**How to apply:** on the next review, check the code first — if a finding is gone, record
whether the *code* changed (retire it, quote the lines that went) or your *judgement*
changed (record as a reversal, keep both readings). Anything the user acts on or
explicitly accepts graduates to a settled-boundaries note, not this file.
Related: [[project-governing-spec]].
