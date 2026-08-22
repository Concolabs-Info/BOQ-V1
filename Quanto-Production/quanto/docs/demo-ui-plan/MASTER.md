# Demo UI — master plan

Planning only. This is not the implementation.

The app is a new standalone demo. It combines the takeoff (chat) workspace with the BOQ UI’s sectioned workflow. One project. One hardcoded drawing package. No model calls, no Codex, no Python. Questions and quantities are supplied later. This folder describes the UI only.

## Three groups

Three groups sit in one horizontal bar: Pre · Takeoff · BOQ. A group opens to the right, toward the next group, and shows its children in that gap. Closed: just the name. Open: `Pre → Upload · Plans · Scale · …` then Takeoff, then BOQ.

1. **Pre-takeoff** — prepare the drawing package
2. **Takeoff** — review and correct each building element
3. **BOQ** — final review and bill

Nothing in a later group is implied by an earlier group. BOQ is not planned in this pass.

## Pre-takeoff order

Locked sequence:

1. Upload
2. Plans
3. Scale
4. Height
5. Specifications
6. Start takeoff

A confirm stands. If the user edits that item, it is no longer confirmed. They save the edit, then confirm again. If they leave the page with unsaved edits, a popup asks them to save or discard. Discard leaves the item as it was. Save keeps the edit; they still confirm again.

Nothing is confirmed because the product suggested it. It is confirmed only when the user confirms it.

## Takeoff

List order (the user can still jump):

1. Columns
2. Beams
3. Slab
4. Floor
5. Ceiling
6. Doors & Windows
7. Walls
8. Roof
9. Stairs & Ramps
10. Foundation

```text
Frame:   Columns → Beams → Slab
Skin:    Floor → Ceiling → Doors & Windows → Walls
Rest:    Roof · Stairs · Foundation
```

Each child has three views: Dimension, Workbook, 3D. Workbook layout is shared. Dimension layout and tools are shared. Overlays and live Draw shapes are per element.

Frame path: **Columns → Beams → Slab**. Through-beams deduct from the plate. Downstands do not — they stay extra-over on Beams. Typical columns stay in the plate (NRM voids < 0.05 m³).

Skin path: **Doors & Windows → Walls**. Floor and Ceiling do not block Walls. Walls wants openings for deducts and columns for snaps.

Quantities only. One workbook per child. Combined BOQ at the end. Create bill lines at the end of the job. Hierarchy: Family → floor. Typical floors are one factored group.

All Takeoff children are planned: Columns, Beams, Slab, Floor, Ceiling, Doors & Windows, Walls, Roof, Stairs & Ramps, Foundation.

## BOQ (folder only)

Named only: final review and bill. Not designed.

## Rules that apply everywhere we have designed

- Never name the sample project in the UI.
- The left list is collapsible on every screen.
- Every child has its own chat. Upload chat is not Plans chat. Plans chat is not Scale chat. The same rule holds in Takeoff. 
- Evidence: the thing being reviewed is sharp. The rest of the sheet is faded.
- A confirm stands until the user edits that item. Then they save and confirm again.



## How to read this folder

```text
docs/demo-ui-plan/
  MASTER.md                 this file
  layout.md                 chrome that stays on every screen
  open-questions.md         things not decided — do not implement as if they were
  pre/                      one file per Pre screen
  takeoff/
    README.md               locked rules for all of Takeoff
    views.md                Dimension · Workbook · 3D
    dimension.md            shared drawing shell and tools
    workbook.md             shared workbook shell
    3d.md                   shared model shell
    doors-windows/          first element
    floor/                  second element
    ceiling/                finishes twin of Floor
    walls/                  third element
    roof/                   covering and upstands
    slab/                   structural plate (moved from Pre)
    columns/                first on the frame path
    beams/                  second on the frame path
    stairs-ramps/           flights, mid-landing, rails
    foundation/             pile concrete and pile caps
  boq/                      placeholder
```

If a screen file and `open-questions.md` disagree, the question wins. Do not fill the gap.