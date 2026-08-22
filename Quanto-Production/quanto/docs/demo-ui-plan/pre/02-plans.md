# Pre — 02 Plans

The user checks the viewports the product cut from the sheets, and fixes them.

A viewport is one cropped region of a page. A page can hold several viewports.

## Happy path

1. The user opens Plans. The product runs a short detect pass, then shows what it found.
2. The left list is an accordion, in the style of CostX:
   - Plans
   - Elevations
   - Sections
   - Details (door details, window details, other details)
3. The user opens a group and picks a viewport. The center shows that crop. The crop is sharp. The rest of the page is still visible but faded.
4. If the box is wrong, the user drags it or pulls any of the four edges.
5. If the name or type is wrong (first floor labelled as second floor), the user changes it.
6. If a viewport is missing, the user adds one. If one should not exist, the user deletes it.
7. Floor-plan viewports also have a **level order** — Ground, First, Second, … Roof. The name is the label. The order is the stack the building sits on. The user can reorder if two floors were swapped.
8. The user confirms the viewports they accept.

## Layout

```text
┌──────────────┬──────────────────────────┬────────────┐
│ Accordion    │ Page with one viewport   │ Chat       │
│ Plans        │ sharp, rest faded        │ Inspector? │
│ Elevations   │                          │            │
│ Sections     │                          │            │
│ Details      │                          │            │
└──────────────┴──────────────────────────┴────────────┘
```

## Left pane

- Accordion groups listed above.
- Each child is a viewport.
- Click a viewport: it becomes the one in the center.
- The pane can be closed.

Whether a page-thumbnail strip also appears while editing is not decided.

## Center pane

- The full page that owns the selected viewport.
- The selected crop is high contrast.
- Everything outside the crop is faded, not hidden, not a jump to a different sheet.
- On the crop: drag to move. Four edges to resize.

## Right pane

Plans chat only. The product can say which viewport it just showed and which page it came from.

Inspector contents are not decided.

## Buttons and controls

| Control | What it does |
|---|---|
| Accordion group | Opens or closes that group |
| Viewport in the list | Selects it and shows it on the page |
| Drag box | Moves the viewport |
| Edge handles (4) | Resizes the viewport |
| Rename | Changes the viewport name |
| Reclassify | Corrects the viewport discipline, view kind, or subjects |
| Add viewport | Creates a missed viewport |
| Delete viewport | Removes a wrong viewport |
| Reorder levels | Changes the stack order of floors |
| Confirm | User accepts the current viewport / set. Only the user’s confirm counts |
| Save | Appears only after they edit a confirmed viewport. Stores the edit. They still have to Confirm again |
| Discard | On the leave popup: drops the unsaved edit. The item stays as it was |
| Collapse left | Hides the accordion |

How the user starts “Add viewport” (which page, which tool) is not decided.

## What the user can do

- See viewports grouped the way a drawing set is grouped.
- See exactly which part of the sheet was taken.
- Move and resize a box.
- Rename and retype a box.
- Add a missed box. Delete a wrong box.
- Reorder floors.
- Confirm only what they accept.

A confirm stands. If they edit a confirmed viewport, it is no longer confirmed. They save, then confirm again. Leaving with unsaved edits opens a popup: save or discard.

## What the user cannot do on this screen

- Set scale. That is Scale.
- Set floor-to-floor height. That is Height.
- Edit the structural plate. That is Takeoff → Slab.
- Open a sheet they excluded in Upload, unless they first turn that sheet back on.

## Not decided

See `open-questions.md` items 11–15.
