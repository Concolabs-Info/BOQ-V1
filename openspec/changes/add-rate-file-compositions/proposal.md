# Add Rate File Compositions

> Superseded note: `add-material-attributes` replaces the Material `type` field with repeatable Material attributes.

## Why
Project rate files need to model full rate buildups, not only material catalog rows. Estimators need separate material, labour, machinery and percentage rate lists so the rate file can later support richer pricing workflows.

## What Changes
- Replace material-only rate items with Material, Labour, Machinery and Percentage rate rows grouped by type.
- Support Material, Labour, Machinery and Percentage item types.
- Store a direct rate value instead of unit cost plus markup.
- Store percentage rows with name and percentage only.
- Add project-scoped dropdown options for type-specific dropdown fields.
- Show Rate Files as Material, Labour, Machinery and Percentage lists.
- Keep BOQ matching and manual picker limited to Material rows until full composition BOQ pricing is implemented.
- Delete legacy material-only rate item rows during the migration to the new composition schema.

## Impact
- Adds migration `017_rate_file_compositions.sql`.
- Reshapes `rate_item` around `item_type`, type-specific fields, `unit_type`, `unit_detail` and `rate`; `main_item` is no longer required by the API or UI.
- Expands `rate_option.option_type` values for composition dropdowns.
- Keeps the existing Rate Files API route family.
- Adds optional rate item filtering by item type for BOQ compatibility.
- Updates the Rate Files UI add flow, drawer, type-grouped table and delete messaging.
- Keeps Percentage rows separate from BOQ matching and pricing in this version.
- Supersedes the material-only assumptions in `add-project-rate-files`.
