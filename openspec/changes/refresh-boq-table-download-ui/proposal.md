# BOQ Table Download UI Refresh

## Summary
Polish the BOQ page table and download controls without changing BOQ data flow or export behavior.

## Motivation
The BOQ table is a dense production view, so rows should respond visually when users scan across them. The toolbar download menu also currently uses custom floating markup; using the existing shadcn/ui dropdown pattern makes the control feel consistent with the rest of the refreshed interface while keeping the same export choices.

## Changes
- Add subtle hover styling to BOQ item rows.
- Add resizable BOQ table columns with browser-local width persistence.
- Replace the custom toolbar download menu with a shadcn/ui dropdown menu.
- Replace primary BOQ native dropdowns with shadcn/ui Select controls.
- Open the download menu on hover, click, and keyboard focus.
- Keep existing download formats and export history behavior.

## Non-Goals
- No backend or export API changes.
- No BOQ table column resizing or full BOQ layout redesign in this pass.
- No changes to rate mapping, row editing, or export generation logic.
