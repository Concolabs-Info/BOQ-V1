# Doors & Windows — Dimension

Drawing work for openings. Uses the shared Dimension shell.

## Happy path

1. The user opens Doors & Windows → Dimension.
2. Left is two tabs. Viewports open on **Ground**. Typical 2nd–7th, Terrace, and the door/window schedule sit under that. Families: Doors → D1…, Windows → W1…. Layers start all on.
3. Center shows the selected plan. Each found opening has a box and a mark (D1, W2) beside it.
4. The user moves or resizes a box so the next person can see it. Count and family size do not change.
5. They delete a wrong box, or Draw a missed opening (Box or Polyline — Line is muted). A popup picks a family or creates a new one.
6. Questions appear in Takeoff (right). Text, choice, yes/no, type-if-no. Example: “this door is not on the schedule — new family?” Example: “is this D1?”
7. They change a box’s type on Item, then Save. Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- Typical 2nd–7th
- Terrace
- Door/window schedule

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

Selected crop sharp, rest faded.

**Families**  
Parent: Doors, Windows. Children: D1, D2, FW2…  
Click a family: canvas jumps to where that type was read (schedule cell or specification). Every field is editable. Edit → Save.

A family is a type. It is not one instance.

## Center pane

The selected floor plan or schedule sheet.

On a plan:

- Bounding box per instance
- Type mark next to the box
- Move and resize the box (position only)
- Delete
- Draw — then the family popup

On the schedule: a box around the rows that were read.

### Draw on this child

Uses the shared Draw menu. Line is muted.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

### Layers on this child

Uses the shared Layers flyout.

```text
☑ Viewport
☑ Doors ▾
    ☑ D1
    ☑ D2
    …
☑ Windows ▾
    ☑ FW2
    …
☑ Schedule marks
```

All on when the user enters this child.

Tick **Doors** off: no door boxes. Open Doors and tick only D1: only D1 boxes. Same for Windows.

### Family popup

After Draw, or from Families as new type.

| Field | Example |
|---|---|
| Parent | Door / Window |
| Mark | D4 |
| Description | Flush timber |
| Width | 900 mm |
| Height | 2100 mm |
| Thickness | 40 mm |
| Material | Timber |
| Fittings | Lockset, 3 hinges |
| Source | Schedule, or not on schedule |

Fittings is one text field. Not a catalogue.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected instance.

- Type at the top. Change it, **Save**
- Mark, family, floor, host
- Width and height from the family, read-only here

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, schedule, or specification sheet |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move / resize box | Changes where the box sits. Not the family size |
| Draw | Box or Polyline. Line is muted. Then the family popup |
| Layers | Viewport, Doors (types), Windows (types), Schedule marks |
| Delete | Removes a wrong instance |
| Type on Item | Reassigns this box. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found door and window on the plan
- See the type mark
- Fix a box, delete one, add one
- Hide a type or a parent with Layers
- Edit a family and save
- Create a family when the schedule has no type
- Change this box to another type and save
- Answer a question about a marked opening

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Change family size by dragging a box.
- Open 3D. That is the 3D view.
