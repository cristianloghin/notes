---
name: review-open-findings-notes
description: Open architecture findings from the 2026-08-08 second review of Notes (src/ only), with dispositions
metadata:
  type: project
---

The **first** review's findings (1–7) are no longer tracked here — their
dispositions are recorded by the user in `docs/architecture.md` §5 and §2.
That file is the single copy; do not duplicate it. Re-derived 2026-08-08:
(1)(2)(4) genuinely resolved in code; (5) resolved by `src/index.ts`;
(3) and (6) still present in `src/react/bindings.ts`; (7) still present
(`src/core/id.ts` module counter).

## Second review, 2026-08-08 (post core/react split). Dispositions: unknown.

1. **Scroll/viewport policy has two owners that disagree in writing.**
   `bindings.ts` `onFocus` blinks `style.opacity` to suppress Safari's
   focus-reveal and calls `scrollIntoView`; `demo/App.tsx` states the reveal
   is desired and left alone. Escalation of architecture.md §5 finding (3):
   new presentation code was added on the side the user already accepted
   moving away from.
2. **`genId` is a module singleton imported by both `reducer.ts` and
   `markdown.ts`**, so §4.2's `new NoteStore({ genId })` cannot reach every
   mint site without threading the factory through the reducer and parser.
   The roadmap step is structurally blocked, not just unimplemented.
3. **`onRowsChange` is a single constructor-bound callback** with no
   re-registration or unsubscribe — the shape §4.3's `onAction` would copy.
4. **`reducer` / `createInitialState` are public with no consumer** — a
   second state-ownership path beside `NoteStore`.
5. **`beforeinput` still wired per-row via the `__clAttached` expando**;
   now cheaper to fix because `Editor` owns the container element.
6. **`Toolbar` derives active row / move affordances**, which §1 says the
   binding layer computes nothing of; a host toolbar re-implements it.
7. **`NoteStore.toMarkdown`** puts serialization in the store beside the
   already-public `serialize`.
Cut for the cap: `useNote` returns the whole state though §1 says components
"read whatever slice they need".

**Why:** these shape the §4 Planner adapter roadmap and the "default skin"
phase; 1 and 2 get more expensive as soon as either starts.

**How to apply:** re-derive from the code before restating any of these. If
one is gone, say whether the *code* changed (retire, quote what went) or my
*judgement* did (record as a reversal, keep both readings). Anything the
user acts on or accepts belongs in architecture.md, not here — delete it
from this file when it lands there. Related: [[project-governing-spec]],
[[feedback-review-scope]].
