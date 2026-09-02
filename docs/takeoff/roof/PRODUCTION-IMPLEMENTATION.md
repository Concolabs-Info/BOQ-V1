# Roof production implementation

The supplied Roof planning documents are preserved under `docs/takeoff/roof/planning/` and are the implementation basis.

Production path:

`Frozen Project Frame → roof source resolver → exact crop + native PDF words → one OpenAI geometry call → deterministic geometry validator → at most one targeted repair crop → PostgreSQL roof topology → project evidence/system resolution → deterministic measurement/NRM routing → unchanged Roof Dimension / Workbook / 3D UI → user confirmation.`

Important implementation rules:

- Exact source-crop pixel coordinates are retained.
- Confirmed Pre scale is the only automatic physical measurement scale.
- Pitched planar actual area is code-calculated from projected area and supported pitch evidence.
- Curved true area is never invented.
- Confirmed user edits are protected from reruns.
- Roof covering/build-up and concrete/reinforcement/formwork remain separate BOQ work-section routes.
- Manual JSON import is supported for model/prompt testing without changing the UI.
- Project Library (`/projects`) is the default application entry. The workflow sidebar includes `Projects` so a user can return and open another saved project.
