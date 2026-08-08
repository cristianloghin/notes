---
name: feedback-review-scope
description: Review src/ only — demo/ is the user's own interface and explicitly out of scope; read it only to verify consumption
metadata:
  type: feedback
---

Architecture reviews of this repo cover `src/` only. `demo/` may be read to
verify how the library is consumed, but is never itself reviewed and its
findings are never reported.

**Why:** the user owns the demo as a personal device-testing skin (iOS
keyboard/viewport experiments, debug HUD, commented-out probes). It is
deliberately scratch, and architecture.md §6 already requires only that it
stay deletable and import from `src/index.ts` alone.

**Amended 2026-08-08 by architecture.md §7:** consumer code IS in scope for
the API-design checks — assess how `demo/App.tsx` and `demo/planner/`
*consume* the library (store construction, hook usage, adapter shape), since
"consuming a capability requires repeated wiring" is a library finding. Still
never review the demo's UI, markup, styling, or device experiments.

**How to apply:** resolve the review target to `src/` unless told otherwise.
Demo code is admissible only as *evidence about the library* — e.g. that the
skin declares a scroll policy the binding layer silently overrides, or that
a public export has no consumer. Related: [[project-governing-spec]].
