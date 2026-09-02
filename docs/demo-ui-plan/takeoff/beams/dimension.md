# Beams — Dimension

Drawing work for RCC beams. Uses the shared Dimension shell.

A run is a centerline. Width and depth are the family. Kind (downstand / through) is on the run. Height / drop comes from the model, not a formula on Pre.

## Two kinds

| Kind | Where it sits | Volume | Slab |
|---|---|---|---|
| **Downstand** | Extra below the soffit | length × width × drop | Leave it |
| **Through** | In the plate | length × width × depth (the plate thickness, or the beam if that *is* the plate) | That strip comes out of Slab |

Isolated vs attached is ignored on this apartment set.

## Happy path

1. The user opens Beams → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, A-A, and B-B sit under that. Families: Beams → marks on the sheet, or size if none. Layers start all on.
3. Center shows the selected plan. Runs are already drawn. A light width wash. Confirmed columns sit at the ends, faded.
4. They drag an end. Length updates. Volume updates. Confirm on that line drops.
5. They delete a false run. They Draw a missed beam (**Line** — Box and Polyline are muted). A popup picks a family or creates a new one.
6. Kind is wrong. Item → Through or Downstand → Save. Same centerline.
7. A long ink line changes size or kind mid-span. They Select the run, click the change point. **Split**. Then Item on the piece.
8. Two collinear same-family, same-kind runs should be one. Item → **Merge**.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if beams read there. Missing, not hidden
- Section A-A
- Section B-B
- Columns and footings detail — if a beam sits on it

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

No invented beam schedule. If the set has no schedule, that category stays **not found**.

Selected crop sharp, rest faded.

**Families**  
Parent: Beams. Children: the marks on the sheet. If a beam has no mark, the child is the size (`230 × 450`). Do not invent B1.

Click a family: canvas jumps to the detail or the section that sized it. Every field is editable. Edit → Save.

A family is a size. It is not one run. Kind is not a family.

## Center pane

The selected floor plan, section, or detail sheet.

On a plan:

- Centerline per run
- Light width wash
- Type mark and live length next to it
- Confirmed columns at the ends, faded. Not editable here
- Drag an end (or a vertex after a bend). Length changes
- Delete the whole run
- Draw Line — then the family popup
- Split — click a point on the selected run
- Merge — from Item

On a section: the crop is sharp. They read drop vs through. They do not draw the beam here.

Snap on: column boxes, other beam ends.

### Draw on this child

Uses the shared Draw menu. No Add / Remove sign. Draw is Add.

| Shape | This child |
|---|---|
| Line | Live |
| Box | Muted |
| Polyline | Muted |

```text
Draw ▾
  Line
  Box       muted
  Polyline  muted
```

After the line: pick or create a Beams family. Kind defaults to **Downstand**. They change it on Item if it is through.

### Split and merge

Not a toolbar mode. Same as Walls.

| Action | How |
|---|---|
| Split | Select a run. Click a point on it. Two runs. Same family and kind until they change one |
| Merge | Item. Two collinear runs, same family, same kind, touching. One run again |

### Layers on this child

```text
☑ Viewport
☑ Beams ▾
    ☑ 230 × 450
    ☑ …
☑ Columns
☑ Schedule marks
```

All on when the user enters this child.

Tick **Beams** off: no centerlines. Open Beams and tick one size: only those runs. **Columns** hides the faded column boxes, not the beams.

### Family popup

After Draw, or from Families as new type.

| Field | Example |
|---|---|
| Mark | Whatever the sheet prints, or blank |
| Description | RCC beam |
| Width | 230 mm |
| Depth | 450 mm |
| Source | Detail / section, or not on detail |

Kind is not on the family. Drop is not on the family. Those live on the run (Item) and in the model.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected run.

- Type (size / mark) at the top. Change it, **Save**
- Mark, family, floor
- **Kind:** Downstand / Through. Change, **Save**
- Width and depth from the family, read-only here
- Length, live
- Drop / depth from the model. Override if the pick was wrong
- Volume readout — extra-over if downstand, full rectangle if through
- Formwork readout
- **Split** — same as clicking the run
- **Merge** — pick the neighbour if one qualifies

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, section, or detail |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move an end / vertex | Changes the run. Length and volume update. Confirm drops |
| Draw | Line. Box and Polyline muted. Then the family popup |
| Layers | Viewport, Beams (types), Columns, Schedule marks |
| Delete | Removes a wrong run |
| Click on selected run | Splits at that point |
| Merge on Item | Joins two collinear same-family, same-kind runs |
| Type on Item | Reassigns this whole run. Save |
| Kind on Item | Downstand or Through. Save |
| Height / drop override on Item | Corrects the model pick. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found beam on the plan
- See the type mark, the width wash, and the live length
- Correct an end, delete a run, add a run
- Split a run where the size or the kind changes
- Merge a cut they do not want
- Set downstand vs through on Item and save
- Snap to columns
- Hide a type or the column hosts with Layers
- Edit a family and save
- Create a family when the sheet has no mark — named by size
- Answer a question about a run

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw a column. That is Columns.
- Draw the slab plate. That is Slab.
- Deduct this run from Slab. Slab reads kind after they confirm.
- Draw a footing. That is Foundation.
- Open 3D. That is the 3D view.
