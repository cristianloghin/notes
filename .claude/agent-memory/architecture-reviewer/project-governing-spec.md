---
name: project-governing-spec
description: docs/note-editor-spec.md (product intent) + docs/architecture.md (structural rules) govern this repo; judge against both
metadata:
  type: project
---

Two governing documents (library renamed from "checklist editor" to "Notes",
2026-08-08; the spec file was docs/checklist-editor-spec.md before that):

- `docs/note-editor-spec.md` — product intent. Especially §4 (flat rows,
  sections derived), §5/§6 (the reducer owns caret placement; the view never
  computes focus), §8 (markdown serialization; parser doubles as paste
  handler), §10 (headless core is the product), §12 (phasing).
- `docs/architecture.md` — structural rules: §1 layer direction (binding
  layer has four declared jobs, incl. the hooks), §2 settled decisions, §3
  the declared public surface, §4 the Planner adapter roadmap (id factory →
  onAction → external updates, all done as of 2026-08-08), §5 open findings
  with dispositions, §6 house rules, §7 API design principles.
  **§7 explicitly widens review scope to consumer code** (the demo's
  adapter and hook usage, later Planner's) — judged on: consumer code is
  the spec, two audiences/two complete layers, React observes never owns,
  the consumer contributes pure functions only, one obvious way.

**Do not restate anything already in architecture.md as if it were my own
note** — it is the user's declaration and the single copy. Memory only holds
findings the doc does not yet cover.

Layout as of 2026-08-08 (re-verified this date): `src/core/` = pure TS
(types, id, markdown, reducer, store + two test files); `src/react/` =
binding (context.tsx, bindings.ts, hooks.ts, Editor.tsx, Toolbar.tsx);
`src/index.ts` = the public surface; `demo/` = skin, outside the package,
imports only `../src` (now also `demo/planner/` — the reference row-grain
adapter, pure functions + tests, which is HOST code by §4 and the thing
§7 judges the API against).

`id.ts` staying its own module is deliberate, not fragmentation: `reducer`
imports `markdown`, so `defaultGenId` living in either would make a cycle.

**How to apply:** read both docs before reviewing; use their vocabulary.
Spec §11 lists open questions — do not report an open question as a defect.
Precedence: the code wins on what *is*, the docs win on what is *intended*;
drift is a finding for the user to resolve. Related:
[[review-open-findings-notes]], [[feedback-review-scope]].

**Tooling coverage gap (re-verified 2026-08-08):** no dead-export detector,
no import-cycle detector, no module-boundary linter; devDependencies are
only vite/vitest/tsc. Check import edges and dead exports by hand (grep for
each `src/index.ts` export across `src/` and `demo/`). Suggested if ever
wanted: `knip` and `dependency-cruiser` or `eslint-plugin-boundaries`.
