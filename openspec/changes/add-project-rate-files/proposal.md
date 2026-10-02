# Add Project Rate Files

> Superseded note: `add-rate-file-compositions` expands this material-only v1 into main-item rate compositions with Material, Labour and Machinery rows.

## Why
Projects need their own material rate files so users can maintain priced material catalogs without changing global data or existing BOQ rows.

## What Changes
- Add project-scoped rate files.
- Add material-only rate items with material name, dropdown specification, optional size, unit cost, markup and project-extensible unit type.
- Add project-scoped dropdown options for unit types and specifications.
- Add a direct workspace sidebar entry for Rate Files.
- Exclude assemblies and labor/equipment cost types from v1.
- Add BOQ rate-file selection, exact material-name/unit/size matching, row-level popup assignment and remembered similar-row mappings.
- Replace ambiguous dash placeholders in BOQ and Rate Files tables with clear empty-state labels.
- Group BOQ row override prompts so multiple auto-filled row changes are saved or discarded together.
- Add direct project sidebar entries for Norm and Rate Breakdown below Rate Files.
- Add project-scoped Norm items grouped as Material, Labor, Machinery and Percentage.
- Add project-scoped custom Norm unit dropdown values per Norm type.
- Add a structure-only Rate Breakdown section for project rate rows.

## Impact
- Adds PostgreSQL tables for `rate_file` and `rate_item`.
- Adds PostgreSQL table `rate_option` for project-scoped unit and specification dropdown values.
- Adds PostgreSQL persistence for selected BOQ rate files and remembered BOQ row to rate item mappings.
- Adds FastAPI endpoints below `/api/v1/projects/{project_id}/rate-files`.
- Adds FastAPI endpoints below `/api/v1/projects/{project_id}/rate-options`.
- Adds FastAPI endpoints below `/api/v1/projects/{project_id}/boq/rate-mappings`.
- Adds FastAPI endpoints below `/api/v1/projects/{project_id}/norm-items` and `/api/v1/projects/{project_id}/norm-options`.
- Adds FastAPI endpoints below `/api/v1/projects/{project_id}/rate-breakdown-items`.
- Adds a frontend page at `/workspace/{projectId}/settings/rate-files`.
- Adds frontend pages at `/workspace/{projectId}/norm` and `/workspace/{projectId}/rate-breakdown`.
- Refines rate items so material identity, specification and size are captured separately.
- Removes element category from rate files and BOQ rate matching.
- Prices BOQ rows from a selected rate file only when an exact material-name/unit/size match exists or the user selects a rate in the row popup.
