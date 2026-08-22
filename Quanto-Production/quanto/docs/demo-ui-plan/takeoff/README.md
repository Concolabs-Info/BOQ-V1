# Takeoff

The second top-level group. The user reviews and corrects each building element.

## Children

List order (the user can still jump):

- Columns
- Beams
- Slab
- Floor
- Ceiling
- Doors & Windows
- Walls
- Roof
- Stairs & Ramps
- Foundation

```text
Frame:   Columns → Beams → Slab
Skin:    Floor → Ceiling → Doors & Windows → Walls
Rest:    Roof · Stairs · Foundation
```

The user can move between children. The agent does not lock them to one path.

Frame path: **Columns → Beams → Slab**. Skin path for wall deducts: **Doors & Windows → Walls**. Floor and Ceiling do not block Walls.

## Three views on every child

Each child opens with three views. Same names everywhere. **Workbook**, **Dimension**, and **3D** layouts are shared. Overlays, live Draw shapes, and which 3D categories start sharp belong to the element.

```text
Takeoff → Doors & Windows
          [ Dimension ]  [ Workbook ]  [ 3D ]
```

See `views.md`, `dimension.md`, `workbook.md`, and `3d.md`.

Element folders hold what is different for that child:

```text
takeoff/
  doors-windows/
    README.md
    dimension.md
    workbook.md
    3d.md
  floor/
    README.md
    dimension.md
    workbook.md
    3d.md
  ceiling/
    README.md
    dimension.md
    workbook.md
    3d.md
  walls/
    README.md
    dimension.md
    workbook.md
    3d.md
  roof/
    README.md
    dimension.md
    workbook.md
    3d.md
  slab/
    README.md
    dimension.md
    workbook.md
    3d.md
  columns/
    README.md
    dimension.md
    workbook.md
    3d.md
  beams/
    README.md
    dimension.md
    workbook.md
    3d.md
  stairs-ramps/
    README.md
    dimension.md
    workbook.md
    3d.md
  foundation/
    README.md
    dimension.md
    workbook.md
    3d.md
```

## Locked for all of Takeoff

- Quantities only. No rates in this demo.
- One workbook per child. Combined BOQ workbook at the end of the job.
- Workbook is a quantities register. Bill lines are created once, at the end, from confirmed quantities. A workbook is not made from bill lines.
- Workbook hierarchy: **Family → floor**.
- Typical floors are one group with a visible factor.
- Show on drawing switches to Dimension view. No split screen.
- Dimension tools: Select, Hand, Measure (H / V / Any), Draw (Line / Box / Polyline), Layers, Snap toggle, Fit, Minimap toggle, Undo, Delete. Draw is Add by default. After Add, a popup picks or creates the family. A child may add a Remove sign for deducts; Remove has no family. The child mutes shapes it does not use. Measure never writes a quantity. Layers is a flyout: tick a category or a type to show or hide overlays.
- Minimap sits on Dimension, off by default. It is the current sheet, not 3D.
- 3D is its own view. Two panes: model and Item. No chat. Storey stepper + All + Typical as one. Category chips: this child sharp, hosts faded, rest off. Colour defaults to Type. Section billboards: dropdown, bottom-right of the canvas. Off, or one cropped section sheet stood up 90° on its cut. Not a section box.
- Chat lives in Dimension only. Workbook and 3D have no transcript.
- Confirm stands. Edit → save → confirm again. Same rule as Pre.
- 3D is in the first demo.

## Not designed

None. Every Takeoff child has a folder. BOQ is still not designed.