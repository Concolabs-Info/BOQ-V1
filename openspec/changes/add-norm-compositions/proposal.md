# Norm Main-Item Compositions

## Summary
Norm will store project-scoped main-item compositions instead of flat type-grouped rows. Each main item contains Material, Labor, Machinery and Percentage child rows entered from one drawer and displayed in an expandable grouped table.

## Key Changes
- Clear existing flat Norm rows during migration.
- Add parent Norm main items with nested child rows.
- Save, edit and delete a whole Norm composition through the existing Norm route family.
- Replace the Add type-selection modal with a composition drawer.
- Display main items first, with chevron expansion into child rows grouped by type.
- Keep project-specific Norm unit options unchanged.
