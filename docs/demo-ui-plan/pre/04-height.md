# Pre — 04 Height

The user sets floor-to-floor height on a section or elevation.

Height is a line on the drawing, not a typed number. The user moves the line. The product reads the height from the confirmed scale.

On this set, **Sectional Elevation B-B** is the sheet that shows the storey heights: Ground 13', typical floors 11', terrace 11'-6'.

## Select the source first

Before height detection runs, the user sees every eligible section/elevation viewport:
included, relevant, and with a confirmed current scale. Each candidate shows a thumbnail,
sheet number, viewport title, kind, and scale status. Clicking it opens its full 150-DPI
crop in the centre, so the user can inspect the level lines and printed heights.

The user chooses exactly one **primary** source. They may also choose one optional
**supporting** source for quiet cross-check evidence. Sections are listed first, but nothing
is preselected and the user may choose an elevation.

## Happy path

1. The user opens Height and previews candidate crops at full resolution.
2. They select a primary source, optionally one supporting source, and start detection.
3. The centre shows the primary source; each storey has a height line the product placed.
4. The user checks a storey. If the line is high or low, they drag it. The height label updates as they drag.
5. The user confirms the whole stack.

## Layout

```text
┌──────────────┬──────────────────────────┬────────────┐
│ Storey list  │ Section / elevation      │ Chat       │
│ Ground …     │ one height line          │ evidence / │
│ Roof         │ per storey               │ confirm    │
└──────────────┴──────────────────────────┴────────────┘
```

## Left pane

- Before detection: candidate source list, with thumbnail, sheet number, title, kind, and
  scale status. One radio button chooses the primary source; one checkbox can add a
  supporting source.
- After detection: the storey stack from Plans (level order).
- Click a storey: the canvas focuses that band.
- The pane can be closed.

## Center pane

- Before detection: the selected candidate at full 150-DPI resolution.
- After detection: the user-selected primary section or elevation used for this work.
- Selected region sharp, rest faded.
- One height line per storey.
- Drag the line up or down. The height label updates.

## Right pane

Before detection, the right pane explains the source choice and enables **Start detection**
only after a primary source is selected. After detection it shows evidence for the current
storey and **Confirm**. A small within-tolerance difference from a supporting source is
available in evidence detail, not treated as a major decision.

Inspector contents are not decided.

## Buttons and controls

| Control | What it does |
|---|---|
| Primary source | Chooses the one required drawing used to propose heights |
| Supporting source | Optionally adds one source for cross-check evidence |
| Start detection | Runs one height-detection call per selected source |
| Storey in the list | Focuses that band on the section |
| Drag height line | Moves the line up or down. Height updates from scale |
| Confirm | User accepts the height for that storey / stack |
| Save | Appears only after they edit a confirmed storey. Stores the edit. They still have to Confirm again |
| Discard | On the leave popup: drops the unsaved edit. The item stays as it was |
| Collapse left | Hides the list |

The user selects the working source before detection. The whole stack confirms at once.
Whether a typical-floor height can be applied to other storeys is not decided.

## What the user can do

- See height as a line on the real section, not as a form field.
- Correct a storey by dragging the line.
- Read the height as they drag.
- Confirm only what they accept.

A confirm stands. If they edit a confirmed storey, it is no longer confirmed. They save, then confirm again. Leaving with unsaved edits opens a popup: save or discard.

## What the user cannot do on this screen

- Crop a new elevation. That is Plans.
- Set scale. That is Scale. This screen needs a confirmed scale on the selected source.
- Edit the structural plate. That is Takeoff → Slab.

## Not decided

See `open-questions.md` item 23.
