# Foundation — Dimension

Drawing work for pile concrete and pile caps. Uses the shared Dimension shell.

A pile is a mark on the layout. A cap is a box on the head. Diameter and cap size are the family. Length of each pile comes from the model. Volume is what they confirm.

## Happy path

1. The user opens Foundation → Dimension.
2. Left is two tabs. Viewports open on the **pile layout** if the backend sent one, else **Ground**. Families: Piles → marks / diameters; Pile caps → sizes. Layers start all on.
3. Center shows the selected sheet. Circles and cap boxes are already drawn if the backend found them.
4. They move a mark onto the grid. Count and family size do not change. Volume does not change.
5. They delete a false pile. They **Add** a missed one (Box — Line is muted). A popup picks a Piles family or creates a new one.
6. They Add a missed cap the same way. Popup: Pile caps. Snap to the pile.
7. The whole instance is the wrong type. They change it on Item, then Save. Volume recalculates.
8. Pile length or cap thickness is wrong. They override on Item. Volume updates. Confirm on that line drops.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

If the backend found nothing: viewports that belong to pile work are listed, empty / **not found**. Both family parents sit as not found. They can still create a family and Draw.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Pile layout / site plan — open first **if sent**
- Ground
- Columns and footings detail — only if it sizes **piles or caps**
- Section A-A
- Section B-B
- A specification sheet only if a **piling / cap** clause was used

No First. No Typical. No internal / blind wall-foundation details.

Selected crop sharp, rest faded. Empty viewports stay listed. Missing, not hidden.

**Families**  
Two parents. Always visible.

- Piles → P1, or `600 dia bored` if the sheet has no mark
- Pile caps → sheet mark, or `1200 × 1200 × 375`

Click a family: canvas jumps to the layout, detail, or clause. Every field is editable. Edit → Save.

Do not invent P1 on first open. No mark → name by size. They can create a code later.

A family is a type. It is not one pile.

## Center pane

The selected layout, ground plan, section, or detail.

**Piles**

- Circle (diameter wash) + mark
- Move = position only
- Delete
- Draw Add — then the Piles family popup
- Snap to a Ground column if one exists (host, optional)

**Caps**

- Box + mark
- Move = position only. Size is the family
- Delete
- Draw Add Box / Polyline — then the Pile caps family popup
- Snap to the pile under it

On a section: the crop is sharp. Commencing level, toe, cap thickness. They do not draw the pile here.

Resize does **not** invent a new diameter or cap size. Wrong size = new family or Item → type.

### Draw on this child

Uses the shared Draw menu. No Add / Remove sign. Draw is Add.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live — caps (odd plan) |

```text
Draw ▾
  Line      muted
  Box
  Polyline
```

After the shape: pick **Piles** or **Pile caps**, then a family or create one. If a Piles family is already selected, the popup defaults to Piles. Same for caps.

### Layers on this child

```text
☑ Viewport
☑ Piles ▾
    ☑ P1
    ☑ 450 dia
    …
☑ Pile caps ▾
    ☑ 1200 × 1200
    …
☑ Columns
☑ Schedule marks
```

All on when the user enters this child.

Tick **Piles** off: no circles. Open Piles and tick one type: only those marks. **Columns** hides the faded hosts, not the piles. No Walls. No strip layers.

### Family popup

After Draw, or from Families as new type.

**Piles family**

| Field | Example |
|---|---|
| Mark | P1 |
| Description | 600 mm dia bored pile |
| Pile type / method | Bored |
| Diameter | 600 mm |
| Concrete grade | C32/40 |
| Reinforcement type / reference | 12Y20 + R10 links @ 200 |
| Source | Pile schedule, or not on schedule |

Length is **not** a family field. Each pile’s concreted length comes from the model (commencing level → toe).

No reinforcement **quantity**. That is not calculated.

**Pile caps family**

| Field | Example |
|---|---|
| Mark | Whatever the sheet prints, or blank |
| Description | RCC pile cap |
| Width | 1200 mm |
| Depth | 1200 mm |
| Thickness | 375 mm |
| Source | Detail, or not on detail |

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected pile or cap.

On a pile:

- Type at the top. Change it, **Save**. The whole instance becomes that family. No redraw
- Mark, family, scope (Ground)
- Diameter from the family, read-only here
- Grade and reinforcement reference from the family, read-only here
- Host column if any
- Concreted length — model, or override
- Commencing level / toe — readout
- Volume, live: `π × r² × L`

On a cap:

- Type at the top. Change it, **Save**
- Mark, family, scope
- Size from the family, read-only here
- Host pile(s)
- Thickness from the family, or override
- Volume, live: `L × W × T`

Confirm stays in Workbook.

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that layout, plan, section, or detail |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move mark / box | Changes where it sits. Not the family size |
| Draw | Box or Polyline. Line is muted. Then Piles or Pile caps, then the family popup |
| Layers | Viewport, Piles (types), Pile caps (types), Columns, Schedule marks |
| Delete | Removes a wrong instance |
| Type on Item | Reassigns this instance. Volume recalculates. Save |
| Length / thickness override on Item | Corrects the model pick. Volume updates. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found pile and cap on the layout
- See the type mark
- Move a mark, delete one, add one
- Change a whole instance’s type on Item and save
- Override length or thickness if the model pick is wrong
- Hide a type or the column hosts with Layers
- Edit a family and save
- Create a family when the sheet has no mark — named by size, or they add a code later
- Answer a question about a pile or a cap
- Open this child when nothing was found, and still Draw

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Change diameter or cap size by dragging a handle.
- Enter reinforcement **quantity**. The reference is on the family. Kg is not calculated.
- Draw a pad, a wall strip, or a ground slab.
- Draw the column stalk. That is Columns.
- Take off tests, rig time, or disposal.
- Open 3D. That is the 3D view.
