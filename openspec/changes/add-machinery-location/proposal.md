# Machinery Location and Attribute Content

## Summary
Rate Files will allow Machinery rows to store an optional free-text Location when a source is selected. Material attribute value wording will be updated to Attribute content so the UI reads more clearly.

## Key Changes
- Add optional `machinery_location` storage on rate items.
- Show a Location textbox below Machinery Source whenever a source is selected.
- Clear Location when Source is cleared.
- Include Machinery Location in search, table details, and rate-file duplication.
- Rename Material attribute value placeholder and modal copy to Attribute content.
