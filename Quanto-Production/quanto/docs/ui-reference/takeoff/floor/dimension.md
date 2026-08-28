# Floor — Dimension

Drawing work for floor finishes. Uses the shared Dimension shell.

A zone is a closed finish polygon. It is not a room graph. It is not the slab.

## Happy path

1. The user opens Floor → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, and the schedule of finishes sit under that. Families: Floors → F01, F02, F05…. Layers start all on.
3. Center shows the selected plan. Zones are already drawn: living, bedrooms, toilets, balconies, cores, parking — each its own fill and mark (F01, F02).
4. They drag a vertex. The area updates. That family / floor line is no longer confirmed.
5. They delete a wrong zone. They **Add** a missed finish (Box or Polyline — Line is muted). A popup picks a family or creates a new one.
6. A shaft has no finish. They **Remove** that shape from the host. Net area falls. No family.
7. A toilet inside living is F02, not a hole. They **Remove** it from F01, then **Add** the same shape as F02.
8. The whole zone is the wrong type. They change it on Item, then Save. No redraw.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if it has a floor finish. Missing, not hidden
- Schedule of finishes

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

Selected crop sharp, rest faded.

**Families**  
Parent: Floors. Children: F01, F02, F05, F08…  
Click a family: canvas jumps to where that type was read (schedule cell or specification). Every field is editable. Edit → Save.

A family is a type. It is not one room.

## Center pane

The selected floor plan or schedule sheet.

On a plan:

- Fill per zone
- Type mark and live area next to it
- Move a vertex or an edge. Area changes
- Delete the whole zone
- Draw Add — then the family popup
- Draw Remove — then a deduct. No family popup

On the schedule: a box around the rows that were read.

Cores and stairs are other zones, not holes. Voids ≤ 1 m² are ignored, not drawn.

### Draw on this child

Uses the shared Draw menu. Line is muted. This child adds a **sign**.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

| Sign | This child |
|---|---|
| Add | Default. New finish zone, then the family popup |
| Remove | Deduct. Area comes out of the host. No family |

```text
Draw ▾
  Line      muted
  Box
  Polyline
  — sign —
  Add       default
  Remove
```

**Add** creates a finish. After the shape: pick or create a family.

**Remove** is a hole. The shape deducts from the zone it sits in. If it sits in more than one, Takeoff asks which host. The deduct stays visible. Select it to move its vertices or Delete it (area returns to the host).

A toilet is not a hole. **Remove** from F01, then **Add** the same shape as F02.

A shaft with no finish is only **Remove**.

### Layers on this child

Uses the shared Layers flyout.

```text
☑ Viewport
☑ Floors ▾
    ☑ F01
    ☑ F02
    ☑ F05
    …
☑ Deducts
☑ Schedule marks
```

All on when the user enters this child.

Tick **Floors** off: no finish fills. Open Floors and tick only F01: only F01 fills. **Deducts** hides the holes, not the hosts.

### Family popup

After Add, or from Families as new type. Not after Remove.

| Field | Example |
|---|---|
| Mark | F01 |
| Description | Porcelain floor tiles |
| Location | Living / dining / pantry |
| Thickness | 9 mm (exclusive of adhesive) |
| Module | 600 × 600 mm |
| Screed | 50 mm cement-sand, or none |
| Background | Screed on RCC |
| Bedding | Cement-sand adhesive |
| Falls | Level / to falls |
| Width class | > 600 mm |
| Source | Schedule, or not on schedule |

Screed is a field. It is not a second overlay. Parking, epoxy, terrace, troughs: Screed = none.

No skirting field. Skirtings are not in this child.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected zone or deduct.

On a zone:

- Type at the top. Change it, **Save**. The whole zone becomes that family. No redraw
- Mark, family, floor, host (unit / room name)
- Area from the polygon, live
- Screed, falls, width class from the family, read-only here

On a deduct:

- No type
- Host
- Deducted area, live

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, schedule, or specification sheet |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move a vertex / edge | Changes the zone or deduct. Area updates. Confirm on that line drops |
| Draw Add | Box or Polyline. Line is muted. Then the family popup |
| Draw Remove | Box or Polyline. Deducts from the host. No family |
| Layers | Viewport, Floors (types), Deducts, Schedule marks |
| Delete | Removes a wrong zone, or a deduct (area returns) |
| Type on Item | Reassigns this whole zone. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found finish zone on the plan
- See the type mark and the live area
- Correct a boundary, delete a zone, add a zone
- Deduct a void
- Turn a piece of F01 into F02 by Remove, then Add
- Change a whole zone’s type on Item and save
- Hide a type or the deducts with Layers
- Edit a family and save
- Create a family when the schedule has no type
- Answer a question about a zone

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw screed as a second shape. Screed rides the zone.
- Draw or measure skirting. Skirtings are not in this child.
- Edit the structural plate. That is Takeoff → Slab.
- Open 3D. That is the 3D view.
- Change Ceiling. Ceiling will copy these zones later. It does not share them.
