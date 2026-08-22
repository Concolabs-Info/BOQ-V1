# Database

`schema/001_pre.sql` is the authoritative fresh Pre schema. `migrations/001_pre.sql` is the first migration and currently matches it. New changes must be added as a new numbered migration; do not edit applied migration files in a live environment.

The ten Pre domain tables are: project, document, page, page_render, sheet, viewport, scale_fit, storey, spec_item and confirmation.
