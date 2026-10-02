# Split Rate Unit Options

## Summary
Rate Files now keep reusable unit type dropdown values separate for Material, Labour and Machinery rows. This prevents Material units such as `m3` and `m2` from mixing with Labour units such as `minute` and `hour`.

## Scope
- Add category-specific unit option types for Material, Labour and Machinery.
- Keep `rate_item.unit_type` as the saved unit field on each row.
- Update the Rate Item drawer to load and save unit options from the current row category only.
- Show category-aware Unit textbox placeholders.

## Out of Scope
- Unit conversion or automatic rate recalculation between different unit types.
