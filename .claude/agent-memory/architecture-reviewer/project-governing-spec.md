---
name: project-governing-spec
description: docs/checklist-editor-spec.md is this repo's governing architecture document; there is no docs/architecture.md
metadata:
  type: project
---

`docs/checklist-editor-spec.md` plays the role of `docs/architecture.md` for the
checklist-editor POC. Judge structure against it — especially §4 (flat rows, sections
derived), §5/§6 (the reducer owns caret placement; the view never computes focus),
§8 (markdown is the integration point; parser doubles as paste handler), §10 (headless
core is the product, React bindings are a thin layer, presentation optional) and
§12 (phasing: 0.3 drag reorder, 0.4 persistence/controlled mode/default skin, 1.0 freeze).

**Why:** the repo is a fresh POC with no git history and no `docs/architecture.md`, so the
spec is the only declaration of intended structure. It was named as authoritative when the
first review was commissioned (2026-08-08).

**How to apply:** read the spec before reviewing; use its section numbers and vocabulary
(row, section, caret, focus contract, skin) in findings. §11 lists open questions — do not
report an open question as a defect. Precedence still holds: the code wins on what *is*,
the spec wins on what is *intended*; drift between them is a finding for the user to
resolve, not a bug in the spec. Related: [[review-open-findings-checklist-editor]].

**Tooling coverage gap (verified 2026-08-08):** the project has no dead-export detector,
no import-cycle detector and no module-boundary linter (`package.json` carries only vite,
vitest, typescript, react). Import edges and dead exports have to be checked by hand at
this size. Suggested if the user ever wants it: `knip` (dead exports) and `dependency-cruiser`
or `eslint-plugin-boundaries` (layer direction).
