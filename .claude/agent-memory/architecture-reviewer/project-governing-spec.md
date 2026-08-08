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
- `docs/architecture.md` — structural rules: layer direction
  (core → binding → skin), settled decisions (caret in state, focus
  re-emission, DOM-origin focus never re-applied), the declared public
  surface in src/lib/index.ts, and the host-adapter stance (no
  host-specific code in src/lib/).

Current architecture (2026-08-08): state lives in a `NoteStore` class
(wraps the pure reducer; `onRowsChange` is the consumer integration seam);
`NoteProvider` + `useSyncExternalStore` hooks provide it; `Editor` and
`Toolbar` are propless render-prop components wiring themselves from
context; DOM glue lives in internal `bindings.ts`.

**How to apply:** read both docs before reviewing; use their vocabulary.
Spec §11 lists open questions — do not report an open question as a defect.
Precedence: the code wins on what *is*, the docs win on what is *intended*;
drift is a finding for the user to resolve. Related:
[[review-open-findings-checklist-editor]].

**Tooling coverage gap (verified 2026-08-08):** no dead-export detector, no
import-cycle detector, no module-boundary linter. Check import edges and
dead exports by hand. Suggested if ever wanted: `knip` and
`dependency-cruiser` or `eslint-plugin-boundaries`.
