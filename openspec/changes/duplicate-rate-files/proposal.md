# Duplicate Rate Files

## Summary
Rate Files can be duplicated inside a project so users can reuse an existing pricing library as a starting point without rebuilding composition rows.

## Key Changes
- Add a Duplicate action between Rename and Delete for each rate file.
- Create the duplicate in the same project with a unique `{original name} copy` style name.
- Copy all composition rows, including stored Material attributes JSON, units and rates.
- Select the new duplicate immediately after creation.
- Keep project-level reusable dropdown options shared instead of physically duplicating option records.
