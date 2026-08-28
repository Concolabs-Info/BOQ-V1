# Floor + Ceiling delivery notes

This update was applied on top of the supplied `quanto.zip` current state. Existing Pre, other Takeoff element demo modules, Review and BOQ code were not replaced.

## Added

- PostgreSQL migration/schema `002_floor_ceiling.sql`.
- Production Floor/Ceiling FastAPI routes and business modules.
- Strict structured model schemas and prompts.
- Real Floor/Ceiling data bridge into the existing demo-derived Dimension / Workbook / 3D UI.
- Floor/Ceiling planning docs supplied with this task under `docs/takeoff/`.
- Windows migration helper.
- Floor/Ceiling tests.

## Intentionally unchanged

- Main Quanto visual shell/navigation.
- Existing demo-derived Takeoff page layout and controls.
- Pre workflow semantics and existing Pre tables.
- Other Takeoff elements.
- Review and BOQ production implementation (later modules).

## Safety/measurement controls

- Source coordinates remain in exact viewport-crop pixels.
- Scale comes only from confirmed Pre scale evidence.
- Official area/length values are computed deterministically by backend code.
- Out-of-bounds, self-intersecting and materially overlapping model geometry is rejected.
- User-confirmed geometry is not overwritten by automatic reruns.
- Ceiling fallback cannot consume unreviewed FloorSpace geometry.
