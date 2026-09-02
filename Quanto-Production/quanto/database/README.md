# Database

Schemas/migrations are applied in numeric order. Do not edit an already-applied migration in a live environment; add a new numbered migration.

- `001_pre.sql` — Pre/project-frame tables.
- `002_floor_ceiling.sql` — Floor and Ceiling production records.
- `003_roof.sql` — Roof production records.
- `004_takeoff_scope.sql` — generic Takeoff Scope manifests, Scope questions/holds and cross-element fact sets.
- `005_takeoff_scope_history.sql` / `006_takeoff_scope_single_current.sql` — Scope history/current-manifest constraints.
- `007_walls.sql` — production Wall families, instances, finishes and Wall review records.
- `008_stairs_ramps.sql` — production Stair/Ramp families, instances, balustrades and review records.
- `009_doors_windows.sql` — production Door/Window definitions, instances and review records.
- `010_columns.sql` — existing production Column records (unchanged by the new element harness).
- `011_element_harness.sql` — shared Floor/Ceiling/Wall/Door/Window/Roof/Stair/Ramp harness run/event state plus Floor geometry-vs-BOQ/skirting derivation support.

For an existing database, run the migration script for your platform. It applies every numbered migration in order, including Walls and Stairs/Ramps. Fresh Docker databases mount the complete production schema chain through `011_element_harness.sql`.
