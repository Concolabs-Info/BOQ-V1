# Ceiling — Dimension

Drawing work for ceiling finishes. Uses the shared Dimension shell.

A zone is a closed soffit polygon. It is not a room graph. It is not Floor. It is not the slab.

## Happy path

1. The user opens Ceiling → Dimension.
2. Left is two tabs. Viewports open on **Ground**. First, Typical 2nd–6th, Terrace, and the schedule of finishes sit under that. Families: Ceilings → C01, C02, C03…. Layers start all on.
3. Center shows the selected plan. Zones are already drawn from this child’s own pass: living, bedrooms, toilets, covered soffits — each its own fill and mark (C01, C02). Open terrace and flower troughs have no zone.
4. They drag a vertex. The area updates. That family / floor line is no longer confirmed.
5. They delete a wrong zone. They **Add** a missed soffit (Box or Polyline — Line is muted). A popup picks a family or creates a new one.
6. A shaft, or open-to-sky, has no soffit. They **Remove** that shape from the host. Net area falls. No family.
7. A toilet soffit inside living is C02, not a hole. They **Remove** it from C01, then **Add** the same shape as C02.
8. The whole zone is the wrong type. They change it on Item, then Save. No redraw.
9. Questions appear in Takeoff (right). Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Ground — open first
- First
- Typical 2nd–6th
- Terrace
- Upper roof / tank — listed if it has a soffit finish. Missing, not hidden
- Schedule of finishes

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

No reflected ceiling plan on this set. Do not invent one.

Selected crop sharp, rest faded.

**Families**  
Parent: Ceilings. Children: C01, C02, C03, C04…  
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

Cores and stairs are other zones, not holes, when they have a soffit. Voids ≤ 1 m² are ignored, not drawn.

Open terrace and flower troughs: no zone. Do not invent a soffit.

### Draw on this child

Uses the shared Draw menu. Line is muted. This child adds a **sign**. Same as Floor.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

| Sign | This child |
|---|---|
| Add | Default. New soffit zone, then the family popup |
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

**Add** creates a soffit finish. After the shape: pick or create a family.

**Remove** is a hole. The shape deducts from the zone it sits in. If it sits in more than one, Takeoff asks which host. The deduct stays visible. Select it to move its vertices or Delete it (area returns to the host).

A toilet soffit is not a hole. **Remove** from C01, then **Add** the same shape as C02.

A shaft, or open-to-sky, is only **Remove**.

### Layers on this child

Uses the shared Layers flyout.

```text
☑ Viewport
☑ Ceilings ▾
    ☑ C01
    ☑ C02
    ☑ C03
    …
☑ Deducts
☑ Schedule marks
```

All on when the user enters this child.

Tick **Ceilings** off: no soffit fills. Open Ceilings and tick only C01: only C01 fills. **Deducts** hides the holes, not the hosts.

No Floor underlay. This child’s overlays are the evidence.

### Family popup

After Add, or from Families as new type. Not after Remove.

| Field | Example |
|---|---|
| Mark | C01 |
| Description | Plaster / skim to RCC soffit, acrylic |
| Location | Living / dining / pantry |
| Thickness | Skim, or board thickness if suspended |
| Background | RCC soffit |
| Height band | ≤ 3.50 m / > 3.50 m |
| Suspension | None, or depth if C04 / C05 |
| Source | Schedule, or not on schedule |

Height band is a field. It is not a second overlay. It is read from Pre → Height for that storey. The user can edit it on the family if the schedule says otherwise.

Suspension is a field on C04 / C05. It is not a void you model. Most types on this set: Suspension = none.

No cornice field. Cornices, trims, access panels, and bulkheads are not in this child.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected zone or deduct.

On a zone:

- Type at the top. Change it, **Save**. The whole zone becomes that family. No redraw
- Mark, family, floor, host (unit / room name)
- Area from the polygon, live
- Height band, suspension, background from the family, read-only here

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
| Layers | Viewport, Ceilings (types), Deducts, Schedule marks |
| Delete | Removes a wrong zone, or a deduct (area returns) |
| Type on Item | Reassigns this whole zone. Save |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found soffit zone on the plan
- See the type mark and the live area
- Correct a boundary, delete a zone, add a zone
- Deduct a void
- Turn a piece of C01 into C02 by Remove, then Add
- Change a whole zone’s type on Item and save
- Hide a type or the deducts with Layers
- Edit a family and save
- Create a family when the schedule has no type
- Answer a question about a zone

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw height as a second shape. Height band rides the zone.
- Draw cornices, trims, access panels, or bulkheads. Those are not in this child.
- Edit Floor. Floor keeps its own polygons.
- Edit the structural plate. That is Takeoff → Slab.
- Open 3D. That is the 3D view.
- Invent a reflected ceiling plan.
