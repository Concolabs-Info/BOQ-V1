# Takeoff backend module

Takeoff reads the immutable frozen Pre Project Frame. It must not duplicate or silently edit Pre state.

## Production boundary now

- `scope/` — deterministic Scope engine for all 10 planned elements. No AI/model calls.
- `floors.py` — current production Floor analysis and persistence.
- `ceilings.py` — current production Ceiling analysis and persistence.
- `roofs.py` — current production Roof analysis and persistence.
- Later element stages (Bind, Detect, Verify, Resolve, Dimension, Quantify, Check) are added behind the same element boundaries.

## Scope rule

Pre tells Takeoff what trusted evidence exists. Scope selects the evidence an element is allowed to use, validates scale/level coverage, registers supporting evidence and dependencies, persists a manifest, and raises named gaps/questions. Bind is the next node that may interpret project-specific drawing conventions.
