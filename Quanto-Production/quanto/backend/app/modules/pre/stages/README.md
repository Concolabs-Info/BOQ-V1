# Pre stage boundaries

The working Pre service modules remain directly under `modules/pre/` to keep stable imports:

- `ingest.py` — document/page ingestion
- `triage.py` — Plans detection and viewport classification
- `levels.py` — storeys and level-stack rules
- `scale.py` — scale evidence/calibration
- `height.py` — height evidence and storey bands
- `specifications.py` — specification/schedule evidence
- `confirmations.py` — content-hash confirmations
- `project_frame.py` — readiness and frozen Project Frame

As each stage grows, its internal helpers can be moved beneath this `stages/` namespace without changing the public API contracts. This avoids Python package/module name collisions while keeping the product boundary explicit.
