# Columns — Dimension

Drawing work for RCC columns. Uses the shared Dimension shell.

A column is a mark on the plan. Closest twin is Doors. The box is position. The section is the family. Height is from the model, not a formula on Pre.

## Happy path

1. The user opens Columns → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, and the columns-and-footings detail sit under that. Families: Columns → whatever marks the sheet has, or size if none. Layers start all on.
3. Center shows the selected plan. Boxes are already drawn from this child’s own pass. A mark sits beside each box.
4. They move a box so it sits on the grid. Count and family size do not change.
5. They delete a false column. They Draw a missed one (Box or Polyline — Line is muted). A popup picks a family or creates a new one.
6. The whole instance is the wrong type. They change it on Item, then Save. No redraw.
7. Ground stalks are already in the height the model gave. They override on Item only if the top or the pad is wrong.
8. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if columns read there. Missing, not hidden
- Columns and footings detail
- Section A-A
- Section B-B

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

No invented column schedule. If the set has no schedule, that category stays **not found**.

Selected crop sharp, rest faded.

**Families**  
Parent: Columns. Children: the marks on the sheet. If a column has no mark, the child is the size (`230 × 450`). Do not invent C1.

Click a family: canvas jumps to the detail or the clause that sized it. Every field is editable. Edit → Save.

A family is a type. It is not one instance.

## Center pane

The selected floor plan, section, or detail sheet.

On a plan:

- Bounding box (or circle) per instance
- Type mark next to the box
- Move the box. Position only
- Delete
- Draw — then the family popup

On the detail: a box around the rows or diagrams that were read.

On a section: the crop is sharp. Height evidence. They do not draw the column here.

Resize does **not** invent a new section. Wrong size = new family or Item → type.

### Draw on this child

Uses the shared Draw menu. No Add / Remove sign. Draw is Add.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

```text
Draw ▾
  Line      muted
  Box
  Polyline
```

After the shape: pick or create a Columns family.

### Layers on this child

```text
☑ Viewport
☑ Columns ▾
    ☑ 230 × 450
    ☑ …
☑ Schedule marks
```

All on when the user enters this child.

Tick **Columns** off: no boxes. Open Columns and tick one type: only those boxes.

### Family popup

After Draw, or from Families as new type.

| Field | Example |
|---|---|
| Mark | Whatever the sheet prints, or blank |
| Description | RCC column |
| Shape | Rectangular / square / circular / L-shaped / T-shaped |
| Width | 230 mm |
| Depth | 450 mm |
| Diameter | — (if circular) |
| Leg sizes | — (if L- or T-shaped: each leg's width × depth) |
| Isolated / attached | Isolated |
| Source | Detail, or not on detail |

Height is **not** a family field. It comes from the model for that instance.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected instance.

- Type at the top. Change it, **Save**. The whole instance becomes that family. No redraw
- Mark, family, floor
- Section from the family, read-only here
- Height from the model. Top is the soffit they selected — top of the slab below to the soffit of the slab or beam above; the joint volume belongs to the slab or beam. On Ground, bottom is the pad — the stalk is included. Override if the pick was wrong
- Volume readout: section area × height, by shape — `0.230 × 0.450 × height` for a rectangle, `π × D²/4 × height` for a circle, sum of leg rectangles for L- or T-shaped

No formwork on this child. Columns are concrete volume only.

Confirm stays in Workbook.

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, section, or detail |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move box | Changes where the box sits. Not the family size |
| Draw | Box or Polyline. Line is muted. Then the family popup |
| Layers | Viewport, Columns (types), Schedule marks |
| Delete | Removes a wrong instance |
| Type on Item | Reassigns this box. Save |
| Height override on Item | Corrects the model pick. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found column on the plan
- See the type mark
- Move a box, delete one, add one
- Change a whole instance’s type on Item and save
- Override height if the soffit or the pad pick is wrong
- Hide a type with Layers
- Edit a family and save
- Create a family when the sheet has no mark — named by size
- Answer a question about a marked column

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Change family size by dragging a box.
- Draw a footing. That is Foundation.
- Draw a beam. That is Beams.
- Edit the structural plate. That is Slab.
- Open 3D. That is the 3D view.
