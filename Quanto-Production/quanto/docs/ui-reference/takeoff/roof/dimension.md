# Roof — Dimension

Drawing work for roof coverings and their upstands. Uses the shared Dimension shell.

A zone is a closed covering polygon. It is not Floor. It is not the slab. An upstand is which edges of that polygon turn up, and how high. It is not a second overlay.

## Happy path

1. The user opens Roof → Dimension.
2. Left is two tabs. Viewports open on **Terrace**. Upper roof / tank, Section A-A, Section B-B, and the waterproofing clauses sit under that. Families: Coverings → R01… and Upstands → U01…. Layers start all on.
3. Center shows the selected plan. Covering zones are already drawn from this child’s own pass: open terrace, troughs, tank. An edge band marks the upstand. Flower troughs and open terrace have no Floor-style tile here — that stayed in Floor.
4. They drag a vertex. The area updates. The upstand length updates with the perimeter. That family / scope line is no longer confirmed.
5. They delete a wrong zone. They **Add** a missed covering (Box or Polyline — Line is muted). A popup picks a Coverings family or creates a new one. Upstand defaults to all edges.
6. A shaft has no covering. They **Remove** that shape from the host. Net area falls. No family.
7. Three sides of a trough turn up, one does not. They select the zone. Item: upstand on **selected edges**. They click the open edge off.
8. The whole zone is the wrong type. They change it on Item, then Save. No redraw.
9. On a section viewport they check the 300 mm against the real cut. Quantities are confirmed in Workbook.

## Left pane

Two tabs at the top. One open at a time. Same shell as `../dimension.md`.

**Viewports**

- Terrace — open first
- Upper roof / tank — listed. Empty is allowed. Missing, not hidden
- Section A-A
- Section B-B
- Waterproofing / roof clauses

A specification sheet appears only if a clause was used. That clause is highlighted. Say **specification**, not spec.

No Ground. No First. No Typical. Those are not roofs.

Selected crop sharp, rest faded.

**Families**  
Two parents.

- Coverings → R01, R02, R03…
- Upstands → U01…

Click a family: canvas jumps to where that type was read (specification). Every field is editable. Edit → Save.

A family is a type. It is not one zone.

## Center pane

The selected roof plan, section, or specification sheet.

On a plan:

- Fill per covering zone
- Type mark and live area next to it
- Edge band on edges that have an upstand
- Move a vertex or an edge. Area and upstand length change
- Delete the whole zone
- Draw Add — then the Coverings family popup
- Draw Remove — then a deduct. No family popup

On a section: the crop is sharp. The product may already have marked the upstand height on the cut. Drag the top of that mark to correct the height. The plan still owns the area.

On the specification: a box around the clauses that were read.

Voids ≤ 1 m² are ignored, not drawn. A tank or trough is a zone, not a hole in the terrace unless it has no covering.

### Draw on this child

Uses the shared Draw menu. Line is muted. This child adds a **sign**. Same as Floor.

| Shape | This child |
|---|---|
| Line | Muted |
| Box | Live |
| Polyline | Live |

| Sign | This child |
|---|---|
| Add | Default. New covering zone, then the Coverings family popup |
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

**Add** creates a covering. After the shape: pick or create a Coverings family. Upstand defaults to **all edges**, height from the Upstands family (300 mm on this set).

**Remove** is a hole. The shape deducts from the zone it sits in. If it sits in more than one, Takeoff asks which host. The deduct stays visible. Select it to move its vertices or Delete it (area returns to the host).

Do not Draw an upstand. Edges are on Item.

### Layers on this child

Uses the shared Layers flyout.

```text
☑ Viewport
☑ Coverings ▾
    ☑ R01
    ☑ R03
    …
☑ Upstands
☑ Deducts
☑ Schedule marks
```

All on when the user enters this child.

Tick **Coverings** off: no fills. Open Coverings and tick only R01: only those fills. **Upstands** hides the edge bands, not the covering. **Deducts** hides the holes, not the hosts.

No Floor underlay. This child’s overlays are the evidence.

### Family popup

After Add, or from Families as new type. Not after Remove.

**Coverings family**

| Field | Example |
|---|---|
| Mark | R01 |
| Description | Two-layer modified bitumen |
| Layers / coats | 2 |
| Insulation | Protected insulated, or none |
| Falls | To outlets |
| Pitch | Level / to falls |
| Source | Specification, or not on specification |

**Upstands family**

| Field | Example |
|---|---|
| Mark | U01 |
| Description | Waterproofed upstand |
| Height | 300 mm |
| Source | Specification, or not on specification |

Pitch on this apartment set is level / to falls. A later house may state a pitch. Do not invent hips or valleys.

## Right pane

**Takeoff** — this child’s questions only.

**Item** — the selected zone, deduct, or upstand edge.

On a covering zone:

- Type (R-code) at the top. Change it, **Save**. The whole zone becomes that family. No redraw
- Mark, family, scope (Terrace / Upper roof)
- Area from the polygon, live
- Falls / layers from the family, read-only here
- **Upstand:** all edges / selected edges. Click an edge to turn it off or on
- Upstand family and height. Change, **Save**

On a deduct:

- No type
- Host
- Deducted area, live

On a section mark:

- Height, live
- Host covering

## Buttons and controls

| Control | What it does |
|---|---|
| Viewport tab | Shows the sheet list |
| Family tab | Shows the type list |
| Viewport in the list | Opens that plan, section, or specification sheet |
| Family in the list | Selects that type and shows its source |
| Save on a family | Stores field edits |
| Move a vertex / edge | Changes the zone or deduct. Area and upstand length update. Confirm on that line drops |
| Draw Add | Box or Polyline. Line is muted. Then the Coverings family popup |
| Draw Remove | Box or Polyline. Deducts from the host. No family |
| Layers | Viewport, Coverings (types), Upstands, Deducts, Schedule marks |
| Delete | Removes a wrong zone, or a deduct (area returns) |
| Type on Item | Reassigns this whole zone. Save |
| Upstand edges on Item | All edges, or selected. Click an edge off |
| Answer in Takeoff | Sends the question result |

Confirm of **quantities** is Workbook, not this pane.

## What the user can do

- See every found covering zone on the terrace or upper roof
- See the type mark, the live area, and the upstand band
- Correct a boundary, delete a zone, add a zone
- Deduct a void
- Turn an edge’s upstand off without a second draw
- Change a whole zone’s type on Item and save
- Check 300 mm on the section viewport
- Hide a type or the upstand bands with Layers
- Edit a family and save
- Create a family when the specification has no type
- Answer a question about a zone

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Draw an upstand as a second shape. Edges ride the zone.
- Take off terrace tiles or trough drainage. That is Floor.
- Take off parapet masonry. That is Walls.
- Take off wet-area tanking in apartments. Not in this child.
- Edit the structural plate. That is Takeoff → Slab.
- Draw hips, valleys, ridges, or eaves. Not on this set.
- Open 3D. That is the 3D view.
