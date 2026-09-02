# Pre data contract

## Canonical geometry

- PDF page size is stored in points.
- Persistent boxes are four integer page milli-points: `[x1, y1, x2, y2]`.
- Model boxes/points are temporary `0..1000`, top-left coordinates.
- Every page render stores its `page_from_image` affine.
- Conversion transforms all corners and takes the resulting envelope, so rotated pages round-trip correctly.

## Confirmation

A confirmation records:

```text
entity_type + entity_id + SHA-256(canonical current content) + actor + confirmed_at
```

The application does not update a confirmation when content changes. Recomputing the hash makes the prior confirmation stale automatically.

Confirmed entity types are:

```text
sheet_set
viewport
storey_stack
scale
height_stack
spec_item
```

## Project Frame

Freeze stores `project-frame-v1` in `project.pre_frame` and increments `frame_version`.

Required top-level fields:

```text
schema_version
project
frame_version
created_at
coordinate_contract
source_documents
sheets
viewports
levels
spec_items
transforms
```

Each included, relevant non-note viewport carries a confirmed scale factor and scale-fit identifier. Levels carry confirmed height data. Specifications retain raw evidence and structured tables. Transforms link every accepted viewport back to its page/render coordinate space.

The JSON Schema is at `shared/schemas/project-frame-v1.schema.json`.
