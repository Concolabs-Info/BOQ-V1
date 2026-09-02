# Stairs & Ramps — Dimension

Drawing work for flights and their open-edge rails. Uses the shared Dimension shell.

A flight is a closed outline of the going, including the **mid-landing**. It is not the storey slab. It is not Floor. A ramp is the same thing with no treads. It only appears if the backend sent a zone.

## Landings

| Landing | Whose child |
|---|---|
| Mid-landing (half / quarter, in the flight) | This child. Rides the flight |
| Bottom (this floor’s plate) | Slab |
| Top (the floor you arrive on) | Slab |

## Happy path

1. The user opens Stairs & Ramps → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, A-A, and B-B sit under that. Families: Flights → whatever the sheet printed, and Balustrades → BR…. Layers start all on.
3. Center shows the selected plan. Flight outlines are already drawn from this child’s own pass. Mid-landing is inside the outline. Top and bottom landings are not.
4. They drag a vertex. Going updates. Volume and balustrade length update. Confirm on that line drops.
5. They delete a false flight. They **Add** a missed one (Box or Polyline — Line is muted). A popup picks a Flights family or creates a new one.
6. A lift is beside the flight, not a hole in it. They do not Remove the lift.
7. Open edges have a rail. The lift side does not. Item: balustrade on **selected edges**. They click the lift edge off.
8. The whole flight is the wrong type. They change it on Item, then Save.
9. On a section they check rise and waist against the real cut. Quantities are confirmed in Workbook.

If the backend found a ramp, it is another Flights family on whatever viewport it arrived with. Same tools. No riser fields.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first. Empty is allowed. Missing, not hidden
- First
- Typical 2nd–6th
- Terrace — listed if a flight reads there. Missing, not hidden
- Section A-A
- Section B-B
- A stair or ramp detail — only if the backend sent one

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

Do not invent a ramp viewport. If the backend did not send one, the list never says Ramp.

Selected crop sharp, rest faded.

**Families**  
Two parents.

- Flights → marks on the sheet, or a size / description if none (`1200 wide dog-leg`). A ramp family only if one was found
- Balustrades → BR1… or the sheet mark

Click a family: canvas jumps to the section or the clause. Every field is editable. Edit → Save.

Do not invent ST1 on first open. They can create a code later.

A family is a type. It is not one flight.

## Center pane

The selected floor plan, section, or detail sheet.

On a plan:

- Fill per flight (going + mid-landing)
- Type mark and live going / width next to it
- Edge band on edges that have a balustrade
- Move a vertex or an edge. Going and rail length change
- Delete the whole flight
- Draw Add — then the Flights family popup
- Draw Remove — then a void in that flight or ramp. Not the lift

On a section: the crop is sharp. They read rise, waist, and that it is a dog-leg. They do not draw each tread.

On a detail: a box around what was read.

### Draw on this child

Uses the shared Draw menu. Line is muted. This child adds a **sign**.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

| Sign | This child |
|---|---|
| Add | Default. New flight (or ramp), then the Flights family popup |
| Remove | Void in that outline. No family |

```text
Draw ▾
  Line      muted
  Box
  Polyline
  — sign —
  Add       default
  Remove
```

**Add** creates a flight. After the shape: pick or create a Flights family. If they are creating, they say stair or ramp in the description. Ramp fields have no risers.

Do not Draw a balustrade. Edges are on Item.

Do not Draw a landing slab at the top or bottom. That is Slab.

### Layers on this child

```text
☑ Viewport
☑ Flights ▾
    ☑ 1200 wide dog-leg
    ☑ 1500 wide ramp
    …
☑ Balustrades
☑ Deducts
☑ Schedule marks
```

All on when the user enters this child.

Tick **Flights** off: no fills. Open Flights and tick one type: only those fills. **Balustrades** hides the edge bands, not the flight. A ramp family only appears in the list if one exists.

No Floor underlay. No Slab underlay.

### Family popup

After Add, or from Families as new type. Not after Remove.

**Flights family**

| Field | Example |
|---|---|
| Mark | Whatever the sheet prints, or blank until they create one |
| Description | RCC dog-leg / 1500 wide ramp |
| Width | 1200 mm |
| Riser | 150 mm (blank on a ramp) |
| Tread | 270 mm (blank on a ramp) |
| Waist | 150 mm |
| Finish | F06 (treads and risers). Blank on a ramp unless scheduled |
| Source | Section / detail, or not found |

**Balustrades family**

| Field | Example |
|---|---|
| Mark | Whatever the sheet prints, or BR1 if they create one |
| Description | Guardrail |
| Height | 1100 mm |
| Source | Detail, or not found |

Going, riser count, and rise come from the outline and the model. They are not family defaults the user must type first.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected flight, ramp, void, or edge.

On a flight:

- Type at the top. Change it, **Save**
- Mark, family, floor
- Width, going (live), risers, waist
- Rise from the model / storey. Override if a flight skips a floor
- Finish (F06), read-only here if it is on the family
- Volume readout (waist + treads + mid-landing)
- Formwork readout (soffit + mid-landing)
- **Balustrade:** all open edges / selected edges. Click an edge off (lift side)

On a ramp:

- Same, without risers / treads / F06 unless scheduled
- Slope / pitch from the model or section

On a void:

- No type
- Host
- Deducted area, live

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, section, or detail |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move a vertex / edge | Changes the flight. Going, volume, and rail length update. Confirm drops |
| Draw Add | Box or Polyline. Line is muted. Then the Flights family popup |
| Draw Remove | Box or Polyline. Void in that outline. No family |
| Layers | Viewport, Flights (types), Balustrades, Deducts, Schedule marks |
| Delete | Removes a wrong flight, or a void (area returns) |
| Type on Item | Reassigns this whole flight. Save |
| Balustrade edges on Item | All open edges, or selected. Click an edge off |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found flight on the plan
- See the mid-landing inside the outline
- See the type mark and the live going
- Correct a boundary, delete a flight, add a flight
- Turn a rail edge off without a second draw
- Change a whole flight’s type on Item and save
- Check rise and waist on the section
- Hide a type or the rail bands with Layers
- Edit a family and save
- Create a mark later if the sheet had none
- Work a ramp with the same tools if the backend sent one
- Answer a question about a flight

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw a balustrade as a second line. Edges ride the flight.
- Take off the top or bottom landing plate. That is Slab.
- Take off core tiles. That is Floor.
- Take off the lift. Not this child.
- Take off stair windows. That is Doors & Windows.
- Invent a ramp viewport or an ST1 code.
- Open 3D. That is the 3D view.
