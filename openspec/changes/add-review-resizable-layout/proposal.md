# Add Review Resizable Layout

## Summary

Make the Review page easier to inspect by allowing users to resize the Floors panel, review table, details panel, and every review table column.

## Motivation

The Review page currently uses fixed-width sections and fixed table columns. Quantity, source, and finish text can need different amounts of space depending on the project, so estimators need adjustable horizontal space without losing existing review actions.

## Proposed Changes

- Add shadcn/ui Resizable support backed by `react-resizable-panels`.
- Replace the desktop fixed review grid with a horizontal resizable panel group.
- Keep the review layout usable on smaller screens without cramped resize handles.
- Add shadcn-styled table header resize handles for every review table column.
- Persist panel sizes and table column widths in `localStorage`.

## Out of Scope

- No backend API changes.
- No changes to review item data, mutations, or confirmation behavior.
- No server-side persistence of layout preferences.
