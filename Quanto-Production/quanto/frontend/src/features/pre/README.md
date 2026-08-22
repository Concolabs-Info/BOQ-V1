# Pre frontend module

The uploaded demo UI is preserved as the visual source of truth. Production concerns are separated into stable stage entry points while the demo-derived composition remains in `components/PrePage.tsx`.

- `upload/` — PDF upload and ingestion progress
- `plans/` — page/viewport triage and inclusion review
- `scale/` — scale evidence, calibration and confirmation
- `height/` — section/elevation source and storey-height confirmation
- `specifications/` — specification/schedule extraction and review
- `start-takeoff/` — readiness gate and freeze action
- `project-frame/` — frozen Pre handoff contract
- `services/` — backend API client for Pre
- `state/` — production Pre UI state
- `types/` — server/data contracts

Takeoff, Review and BOQ remain separate product modules and are not coupled to Pre state.
