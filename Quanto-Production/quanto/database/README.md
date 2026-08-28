# Database

Schemas/migrations are applied in numeric order. Do not edit an already-applied migration in a live environment; add a new numbered migration.

- `001_pre.sql` — Pre/project-frame tables.
- `002_floor_ceiling.sql` — Floor and Ceiling production records.
- `003_roof.sql` — Roof production records.
- `004_takeoff_scope.sql` — generic Takeoff Scope manifests, Scope questions/holds and cross-element fact sets.

For an existing database already at `003`, apply `004_takeoff_scope.sql`. The migration scripts under `infrastructure/scripts/migrations/` apply all numbered migrations in order.
