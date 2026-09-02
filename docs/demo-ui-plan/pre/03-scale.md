# Pre — 03 Scale

The user confirms the scale of each viewport that needs one. Scale is per viewport, not per page.

A number the product found is a recommendation. It is not confirmed until the user confirms it.

## How the product finds a recommendation

Triage identifies the applicable printed scale in this order:

1. Printed scale **inside the viewport**.
2. If none, printed scale **for the whole page**.

Independently, the Scale step locates one known horizontal dimension line and one known
vertical dimension line, snaps them deterministically to the drawing, and compares the
factors they imply with the printed scale. If no usable printed factor exists, the X/Y lines
provide the recommendation instead.

Those three cases all happen on real sheets. A page can have:

- one scale on one viewport only
- one scale for the whole page
- a page scale plus extra scales on some viewports; a viewport with no own scale falls back to the page

If the printed values and the measured points disagree, the user chooses. The product does not choose.

## Happy path — already agrees

1. The user opens a viewport.
2. The center highlights where the scale was read (on the crop, or at the bottom of the page). Crop sharp, rest faded.
3. The product shows the snapped X and Y dimension lines, their literal values, and their
   deviation from the printed scale.
4. Chat shows the evidence. The user confirms; the product never confirms automatically.

## Happy path — they disagree

1. Same as above, plus the product states that the sources do not match, and by how much.
2. Chat asks the user to pick:
   - the first printed source
   - the second printed source
   - the measured X/Y
   - or draw their own two points
3. If the user draws their own points, and those points land close to the product’s X/Y, the product asks them to **adjust the existing X/Y lines** rather than keep two new random points.
4. The user confirms the choice they want.

## Layout

```text
┌──────────────┬──────────────────────────┬────────────┐
│ Viewports    │ Sheet + evidence         │ Chat       │
│ that need    │ printed scale highlighted│ question / │
│ scale        │ X and Y lines            │ evidence   │
└──────────────┴──────────────────────────┴────────────┘
```

The left list is the plan viewports (and any other viewport this screen covers — see open questions). Same accordion style as Plans, filtered to what this screen is for.

## Left pane

- The viewports the user is scaling.
- Status on each row is either waiting, needs a choice, or confirmed by the user.
- Click a row: that viewport’s sheet opens in the center.
- The pane can be closed.

## Center pane

- The page of the selected viewport. Crop sharp, rest faded.
- Highlight on the printed scale the product used (viewport or page).
- Two known dimension lines: one horizontal, one vertical. Each shows the literal marked
  distance, snapped endpoints, calculated factor, and deviation from the printed scale.
- For a plain-English scale, show both the exact printed text and the product's interpreted
  canonical ratio before showing the X/Y comparison.
- The user can stretch those lines. A horizontal line stays horizontal. A vertical line stays vertical. The cursor may drift; the line does not.

## Right pane

Chat.

- If sources agree: evidence + **Confirm**.
- If they disagree: the choice above + **Confirm**.
- After the user draws or stretches lines: a popup asks for the real distance of that line.

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport in the list | Opens that viewport’s evidence |
| Stretch X line | Moves the horizontal check; stays horizontal |
| Stretch Y line | Moves the vertical check; stays vertical |
| Draw own two points | Starts a new pair of points. Product may ask to reuse its X/Y instead |
| Distance popup | User types the real length of the selected line |
| Choice in chat | Picks printed source 1, printed source 2, measured X/Y, or own points |
| Confirm | User accepts the scale for this viewport |
| Save | Appears only after they edit a confirmed viewport. Stores the edit. They still have to Confirm again |
| Discard | On the leave popup: drops the unsaved edit. The item stays as it was |
| Collapse left | Hides the list |

## What the user can do

- See where a scale was read from.
- See the snapped X/Y evidence and why it agrees or disagrees with the printed scale.
- Stretch those lines without them going diagonal.
- Enter a real distance.
- Pick which source to trust when they clash.
- Confirm only what they accept.

A confirm stands. If they edit a confirmed viewport, it is no longer confirmed. They save, then confirm again. Leaving with unsaved edits opens a popup: save or discard.

## What the user cannot do on this screen

- Change the viewport box. That is Plans.
- Set floor-to-floor height. That is Height.
- Edit the structural plate. That is Takeoff → Slab.

## Not decided

See `open-questions.md` items 16–20.
