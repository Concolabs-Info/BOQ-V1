# Add Material Attributes

## Why
Material rate rows need more flexible classification than one fixed Type dropdown. Materials such as Steel may need Diameter and Appearance, while Cement may need different attributes such as Grade or Packing.

## What Changes
- Replace the Material `type` field with repeatable Material attributes.
- Scope reusable attribute names by project and material name.
- Scope reusable attribute values under a single attribute.
- Store selected attribute/value pairs on each material rate item.
- Keep Material attributes optional.
- Keep Labour and Machinery rate rows unchanged.

## Impact
- Adds migration `018_material_attributes.sql`.
- Drops `rate_item.material_type`.
- Adds `rate_item.material_attributes` JSON storage.
- Adds material attribute catalog tables and API endpoints.
- Updates the Material drawer to load attributes after selecting a material name.
- Updates Rate Files and BOQ rate picker detail display/search to include selected material attributes.
- Supersedes the Material `type` field introduced by `add-rate-file-compositions`.
