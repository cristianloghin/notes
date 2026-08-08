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
- `docs/architecture.md` — structural rules: §1 layer direction, §2 settled
  decisions, §3 the declared public surface, §4 the Planner adapter roadmap
  (injectable id factory → onAction → controlled mode), §5 dispositions of
  the first review's findings, §6 house rules.

**Do not restate anything already in architecture.md as if it were my own
note** — it is the user's declaration and the single copy. Memory only holds
findings the doc does not yet cover.

Layout as of 2026-08-08 (verified): `src/core/` = pure TS (types, id,
markdown, reducer, store + two test files); `src/react/` = binding
(context.tsx, bindings.ts, Editor.tsx, Toolbar.tsx); `src/index.ts` = the
public surface; `demo/` = skin, outside the package, imports only `../src`.

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
