# Slab — Dimension

Drawing work for the structural plate. Uses the shared Dimension shell.

A plate is a closed polygon on the plan. Thickness is a property, read from the section. A through-beam is a deduct in the volume. A downstand is not.

## Two beam kinds

| Kind | Where it sits | Slab |
|---|---|---|
| **Downstand** | Extra below the soffit | Leave it. Beams bills the extra only |
| **Through** | The beam runs **in** the plate (same depth as the slab, or the slab is the beam) | That plan strip is **beam** concrete. It comes out of Slab |

Columns punching the plate are **not** deducted unless the void is **≥ 0.05 m³** (NRM 11). On this apartment set they stay in.

## Happy path

1. The user opens Slab → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, Section A-A, and Section B-B sit under that. Families: Slabs → S1…. Layers start all on.
3. Center on a plan: plates already drawn. Through-beams already confirmed in Beams sit on the plate, faded, as deducts. Downstands do not.
4. They drag a vertex. Area updates. Volume updates. Confirm on that line drops.
5. They delete a wrong plate. They **Add** a missed plate (Box or Polyline — Line is muted). A popup picks a family or creates a new one.
6. A true void (stair, shaft) has no slab. They **Remove** that shape. Net area falls. No family.
7. They open Section B-B. Two lines per storey: top of slab / soffit, bottom of slab / floor. Steps break the line. Labels show **thickness** and run length. They drag a run or a step.
8. The whole plate is the wrong type. They change it on Item, then Save.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if it has a plate. Missing, not hidden
- Section A-A
- Section B-B

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

On this set, **Sectional Elevation B-B** is the sheet that shows the slab bands, the steps at flower troughs and guard walls, and the ground split between driveway and garden.

Selected crop sharp, rest faded.

**Families**  
Parent: Slabs. Children: S1, S2… (or by thickness if the set has no marks).  
Click a family: canvas jumps to the section run or the clause. Every field is editable. Edit → Save.

A family is a type. It is not one plate.

## Center pane

### On a plan

- Fill per plate
- Type mark and live area next to it
- Through-beam deducts, faded. Not editable here. That is Beams
- Move a vertex or an edge. Area changes
- Delete the whole plate
- Draw Add — then the family popup
- Draw Remove — then a void. No family popup

Cores and stairs are other plates or voids, not through-beams. Voids &lt; 0.05 m³ stay in.

### On a section

- The crop is sharp
- Two lines per storey: soffit and floor
- Breaks at steps
- Drag a flat run vertically. Drag a step horizontally
- Labels at each change: thickness and run length

The product can show those lengths because the viewport already has a confirmed scale (Pre → Scale). Height of the storey is Pre → Height. This view only owns thickness and steps.

### Draw on this child

Uses the shared Draw menu. Line is muted. This child adds a **sign**. Same as Floor.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

| Sign | This child |
|---|---|
| Add | Default. New plate, then the family popup |
| Remove | Void. Area comes out of the host. No family |

```text
Draw ▾
  Line      muted
  Box
  Polyline
  — sign —
  Add       default
  Remove
```

Do not Draw a through-beam. That is Beams. Once confirmed there, it deducts here.

### Layers on this child

```text
☑ Viewport
☑ Slabs ▾
    ☑ S1
    …
☑ Through-beams
☑ Deducts
☑ Schedule marks
```

All on when the user enters this child.

**Through-beams** hides the faded beam strips, not the plate. **Deducts** hides voids (shafts), not the through-beams.

### Family popup

After Add, or from Families as new type. Not after Remove.

| Field | Example |
|---|---|
| Mark | S1 |
| Description | RCC slab |
| Thickness | 150 mm |
| Falls | Level / to falls |
| Source | Section, or not on section |

Thickness is the family default. A stepped run on the section can override that plate’s thickness.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected plate, void, or section run.

On a plate:

- Type at the top. Change it, **Save**
- Mark, family, floor
- Area, live
- Thickness — family, or override from the section
- Volume, live: `(area − through-beam strips) × thickness`
- Through-beams on this plate — read-only list

On a void:

- No type
- Host
- Deducted area, live

On a section run:

- Thickness, live
- Length of that run
- Host storey / plate

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan or section |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move a vertex / edge | Changes the plate or void. Volume updates. Confirm drops |
| Drag a section run / step | Changes thickness or the break. Labels update |
| Draw Add | Box or Polyline. Line is muted. Then the family popup |
| Draw Remove | Box or Polyline. Void. No family |
| Layers | Viewport, Slabs (types), Through-beams, Deducts, Schedule marks |
| Delete | Removes a wrong plate, or a void (area returns) |
| Type on Item | Reassigns this whole plate. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found plate on the plan
- See thickness and steps on the section
- Correct a boundary, delete a plate, add a plate
- Deduct a shaft
- See through-beams come out of the volume
- Leave downstands alone
- Hide a type or the beam strips with Layers
- Edit a family and save
- Answer a question about a plate or a step

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw a beam. That is Beams.
- Deduct a downstand. That extra sits on Beams.
- Deduct a typical column. NRM voids &lt; 0.05 m³ stay in.
- Edit Floor. Floor is finishes.
- Set floor-to-floor height. That is Pre → Height.
- Open 3D. That is the 3D view.
