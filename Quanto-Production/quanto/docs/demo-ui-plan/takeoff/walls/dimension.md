# Walls — Dimension

Drawing work for masonry. Uses the shared Dimension shell.

A run is a centerline. Thickness is a property. Height is a property. The two faces are finishes on that same line. They are not a second overlay.

## Happy path

1. The user opens Walls → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, and the wall type notes sit under that. Families: Walls → M01, M03… and Finishes → W01, W05…. Layers start all on.
3. Center shows the selected plan. Runs are already drawn. A light thickness wash tells 225 from 115. Confirmed doors and windows sit on the line, faded.
4. They drag an end. Length updates. Net area updates. That family / floor line is no longer confirmed.
5. They delete a false run. They Draw a missed wall (**Line** — Box and Polyline are muted). A popup picks a family or creates a new one.
6. A long ink line changes type at a wet room. They Select the run, click the change point. **Split**. Then Item → type → Save on the wet piece.
7. Two collinear same-family runs should be one. Item → **Merge**.
8. Side 1 is W05, side 2 is W01. They set that on Item, then Save. No second line.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first. Empty is allowed. Missing, not hidden
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if it has masonry. Missing, not hidden
- Wall type notes

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

Selected crop sharp, rest faded.

**Families**  
Two parents.

- Walls → M01, M02, M03, M04, M06…
- Finishes → W01, W02, W05…

Click a family: canvas jumps to where that type was read (schedule cell or specification). Every field is editable. Edit → Save.

A family is a type. It is not one run.

## Center pane

The selected floor plan or schedule sheet.

On a plan:

- Centerline per run
- Light thickness wash (225 ≠ 115)
- Type mark and live length next to it
- Confirmed openings on that run, faded. Not editable here
- Drag an end (or a vertex after a bend). Length changes
- Delete the whole run
- Draw Line — then the family popup
- Split — click a point on the selected run
- Merge — from Item

On the notes / schedule: a box around the clauses that were read.

Cores are walls around the shaft, not holes. Openings are doors and windows already taken off.

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

After the line: pick or create a **Walls** family (M-code). Finishes are not drawn.

Snap on: ends, existing runs, openings.

### Split and merge

Not a toolbar mode.

| Action | How |
|---|---|
| Split | Select a run. Click a point on it. Two runs. Same family until they change one |
| Merge | Item. Two collinear runs, same Walls family, touching. One run again |

Split is for a type or finish change along one ink line. Merge undoes a cut they do not want.

### Layers on this child

Uses the shared Layers flyout.

```text
☑ Viewport
☑ Walls ▾
    ☑ M01
    ☑ M03
    …
☑ Finishes ▾
    ☑ W01
    ☑ W05
    …
☑ Openings
☑ Schedule marks
```

All on when the user enters this child.

Tick **Walls** off: no centerlines. Open Walls and tick only M01: only those runs. **Finishes** tints the faces of runs that wear that W-code. It does not hide the masonry. **Openings** hides the faded door and window marks, not the runs.

### Family popup

After Draw, or from Families as new type.

**Walls family**

| Field | Example |
|---|---|
| Mark | M01 |
| Description | External clay brick / block |
| Thickness | 225 mm (nominal) |
| Classification | External / internal |
| Height | Storey (from Pre), or override |
| Source | Schedule, or not on schedule |

**Finishes family**

| Field | Example |
|---|---|
| Mark | W01 |
| Description | Plaster, skim, washable acrylic |
| Thickness | 12–15 mm |
| Background | Masonry |
| Source | Schedule, or not on schedule |

Default height for a Walls family is the storey from Pre → Height. Override is for parapets and mezzanines.

Default faces are not locked on the M-family. Side 1 and side 2 live on the **run** (Item).

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected run.

- Type (M-code) at the top. Change it, **Save**. The whole run becomes that family. No redraw
- Mark, family, floor
- Length, live
- Height — storey, or override for parapet / mezzanine
- Thickness from the family
- Gross / deduct / **net** m²
- Openings on this run — read-only. Auto from confirmed Doors & Windows. Deduct if **> 0.50 m²**
- **Side 1** finish. **Side 2** finish. Change, **Save**. Same centerline
- **Split** — same as clicking the run
- **Merge** — pick the neighbour if one qualifies

A door on two runs: Takeoff asks which host. Do not invent a split of the opening.

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, notes, or specification sheet |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move an end / vertex | Changes the run. Length and net area update. Confirm on that line drops |
| Draw | Line. Box and Polyline muted. Then the Walls family popup |
| Layers | Viewport, Walls (types), Finishes (types), Openings, Schedule marks |
| Delete | Removes a wrong run |
| Click on selected run | Splits at that point |
| Merge on Item | Joins two collinear same-family runs |
| Type on Item | Reassigns this whole run. Save |
| Side 1 / Side 2 on Item | Sets the coats. Save |
| Height override on Item | Parapet or mezzanine. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found masonry run on the plan
- See the type mark, the thickness wash, and the live length
- Correct an end, delete a run, add a run
- Split a run where the type or the face changes
- Merge a cut they do not want
- Change a whole run’s M-code on Item and save
- Set different finishes on the two faces and save
- Override height for a parapet or a mezzanine
- Hide a type or the opening marks with Layers
- Edit a family and save
- Create a family when the schedule has no type
- Answer a question about a run

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw a finish as a second line. Finishes ride the run.
- Draw or edit a door or a window. That is Doors & Windows.
- Edit Floor or Ceiling. Those keep their own polygons.
- Edit the structural plate. That is Takeoff → Slab.
- Open 3D. That is the 3D view.
