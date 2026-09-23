# Add Rate File Compositions

> Superseded note: `add-material-attributes` replaces the Material `type` field with repeatable Material attributes.

## Why
Project rate files need to model full rate buildups, not only material catalog rows. Estimators need to group material, labour and machinery rates under reusable main items such as Concrete so the rate file can later price BOQ rows as a complete composition.

## What Changes
- Replace material-only rate items with composition rows grouped by main item.
- Support Material, Labour and Machinery item types.
- Store a direct rate value instead of unit cost plus markup.
- Add project-scoped dropdown options for main items and all type-specific dropdown fields.
- Show Rate Files as expandable main-item groups with summed composition totals.
- Keep BOQ matching and manual picker limited to Material rows until full composition BOQ pricing is implemented.
- Delete legacy material-only rate item rows during the migration to the new composition schema.

## Impact
- Adds migration `017_rate_file_compositions.sql`.
- Reshapes `rate_item` around `item_type`, `main_item`, type-specific fields, `unit_type`, `unit_detail` and `rate`.
- Expands `rate_option.option_type` values for composition dropdowns.
- Keeps the existing Rate Files API route family.
- Adds optional rate item filtering by item type for BOQ compatibility.
- Updates the Rate Files UI add flow, drawer, grouped table and delete messaging.
- Supersedes the material-only assumptions in `add-project-rate-files`.
