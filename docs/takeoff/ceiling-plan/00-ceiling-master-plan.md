# Ceiling Planning and Implementation Plan

This is the main plan for building the **Ceiling** part of Quanto.

The plan follows the same idea used for Pre, Columns and Floors:

1. decide what a real QS needs;
2. decide where the evidence can appear;
3. reuse confirmed information that already exists in Quanto;
4. use AI for drawing understanding and difficult interpretation;
5. use code for geometry checks, scale and quantity calculation;
6. let the user edit and confirm anything uncertain;
7. keep every quantity traceable to the source drawing, schedule or specification.

The language here is simple, but the plan is detailed enough to implement the real application.

---

## 1. Main Ceiling decision

The most important rule is:

> **If there is no ceiling-specific drawing, reuse the already confirmed Floor room geometry as the default ceiling geometry. If a reflected ceiling plan or other ceiling drawing exists, analyse it separately and use it to confirm, split or override the room-based ceiling geometry.**

This avoids doing the same room-detection work twice when the project does not contain a ceiling plan.

### Example — no RCP

```text
Bedroom room polygon from Floor
        ↓
No ceiling drawing and no special ceiling evidence
        ↓
Use same polygon as the default ceiling zone
        ↓
Find ceiling finish from schedule/specification
        ↓
Calculate ceiling finish quantity
```

### Example — RCP exists

```text
Bedroom room polygon from Floor
        +
Reflected ceiling plan
        ↓
RCP shows two ceiling zones
        ↓
Split the bedroom into C01 and C03 ceiling zones
        ↓
Measure each zone separately
```

---

## 2. What the Ceiling module owns

The Ceiling module mainly owns **ceiling and soffit finishes** and related measurable ceiling works.

It can include, where the project information supports them:

- flat ceiling finishes;
- suspended ceilings;
- plasterboard/gypsum board ceilings;
- acoustic tile/grid ceilings;
- plastered soffits;
- exposed concrete soffit finishes;
- painted ceilings/soffits;
- sloped or raked ceilings;
- vaulted or multi-plane ceilings;
- dropped/stepped ceilings;
- bulkhead undersides and faces;
- ceiling islands or partial suspended zones;
- stair soffits when they are part of the ceiling/soffit finish scope;
- balcony, canopy, verandah and other external soffit finishes;
- perimeter trims, cornices, shadow gaps or similar items when they are specified and measurable from ceiling geometry.

The Ceiling module does **not** automatically own:

- structural slabs;
- roof coverings;
- structural roof framing;
- MEP fixtures such as lights, diffusers and sprinklers as BOQ ceiling-finish quantities.

MEP symbols are still useful evidence because they can help identify an RCP, a ceiling zone or a suspended ceiling layout.

---

## 3. Main outputs

For each building level, Quanto should be able to produce:

- ceiling zones;
- related room/space IDs;
- ceiling type and finish code;
- flat/sloped/special classification;
- ceiling height or level where available;
- high/low levels for sloped ceilings where available;
- source/evidence links;
- confidence and review status;
- validated source-pixel geometry;
- world-coordinate geometry after scale/alignment;
- deterministic measured area/length;
- downstream Dimension, Workbook, 3D, Review and BOQ objects.

---

## 3A. Reuse section evidence already found in Pre

Pre should not only find that a page contains a section. It should create reusable section evidence once so Ceiling, Walls, Roof, Stairs and other elements do not keep rediscovering the same vertical information.

For each section view, Pre should store where possible:

- section ID/name, such as `A-A`;
- source page and section-view bounding box/crop;
- floor/level lines and labels;
- ceiling/soffit level notes;
- flat ceiling segments;
- sloped/raked/vaulted ceiling evidence;
- bulkheads/dropped ceiling evidence;
- double-height/open-to-below evidence;
- stair soffit evidence;
- roof/ceiling profile evidence that may affect ceiling shape;
- dimensions, notes, detail references and confidence.

Pre stores these as **reusable observations/evidence**, not final Ceiling quantities. Ceiling owns the job of linking those observations to the correct `FloorSpace`/`CeilingZone`, constructing measurable geometry and calculating the BOQ quantity.

### Why this matters

```text
Pre finds Section A-A once
        ↓
Pre stores crop + levels + slope/bulkhead observations
        ↓
Ceiling reuses those observations
        ↓
Only if evidence is incomplete, run a targeted section model call
        ↓
Build measurable CeilingZone / CeilingPlane / Bulkhead
```

This reduces repeated AI calls, keeps all elements consistent and makes section evidence reusable across the application.

---

## 4. Complete Ceiling workflow

```text
Drawing package uploaded
        ↓
Pre identifies relevant floor / RCP / section / schedule / specification pages
        ↓
Pre stores reusable section crops + vertical/special-geometry observations
        ↓
Read confirmed FloorLevel + FloorSpace data
        ↓
Check whether a ceiling-specific drawing exists
        ↓
┌─────────────────────────────┬────────────────────────────────┐
│ No RCP / ceiling drawing    │ RCP / ceiling drawing exists   │
│                             │                                │
│ Reuse FloorSpace polygons   │ Align RCP to FloorLevel        │
│ as default ceiling zones    │ Detect ceiling zones           │
└─────────────────────────────┴────────────────────────────────┘
        ↓
Check special ceiling evidence from RCP, plans, sections and details
        ↓
Create/adjust CeilingZone geometry
        ↓
Build project CeilingFinishDefinition library from schedules/specs/legends
        ↓
Resolve finish for every CeilingZone
        ↓
Validate geometry, evidence and conflicts
        ↓
User reviews/edits if required
        ↓
Code calculates final quantities
        ↓
Dimension → Workbook → 3D → Review → BOQ
```

---

## 5. Source order

Ceiling information can appear in many different places. Do not hard-code one source format.

### Geometry sources

Use the best available evidence in roughly this order:

1. reflected ceiling plan / RCP;
2. ceiling layout drawing;
3. room geometry already confirmed by Floor;
4. sections and elevations for special ceiling shape/height;
5. floor plan notes/details;
6. architectural details.

### Finish/type sources

A ceiling finish may be defined by:

- direct ceiling code on the plan/RCP, such as `C01`, `CL-02`, `CT3`;
- colour fill + legend;
- hatch/pattern + legend;
- room finish schedule;
- ceiling schedule;
- finish schedule;
- direct note inside the room/zone;
- keynote/detail reference;
- specification;
- general note such as "unless noted otherwise";
- normalized room-type rule, for example all bedrooms use C01.

The fixed system flow stays the same even when the drawing convention changes.

---

## 6. Reusing Floor room geometry

Floor data is an important dependency.

A confirmed `FloorSpace` already gives us:

- level/floor identity;
- room ID;
- room name;
- normalized room type;
- room polygon;
- internal/external classification;
- source geometry and scale relationship.

When there is no ceiling-specific drawing, create a **default CeilingZone candidate** from this polygon.

Do not copy it blindly when evidence says the ceiling is different.

Examples requiring an override:

- room is open to sky;
- double-height/open-to-below space;
- stair void;
- sloped/raked ceiling;
- partial suspended ceiling;
- ceiling island;
- bulkhead/dropped zone;
- different ceiling types inside one room;
- external space with no soffit above;
- room boundary differs from ceiling boundary.

---

## 7. Ceiling geometry is not always equal to floor area

For a normal flat ceiling, the room plan area and ceiling plan area are often the same.

For special ceilings, they are not.

Examples:

- sloped ceiling: actual surface area is larger than horizontal plan area;
- vaulted ceiling: one room may contain several sloping planes;
- open-to-sky courtyard: floor area exists but no ceiling exists;
- double-height lobby: lower floor exists but the ceiling is at the upper level;
- partial suspended ceiling: only part of the room receives that ceiling system;
- bulkhead: underside and vertical faces may be measured separately.

So the system must keep **plan-zone geometry** and **measured surface geometry** conceptually separate.

---

## 8. Main objects

### CeilingZone
One spatial ceiling/soffit zone associated with a level and normally one or more FloorSpaces.

### CeilingFinishDefinition
One reusable project ceiling finish/type, for example `C03 — 600x600 acoustic tile in exposed grid`.

### CeilingFinishAssignment
The evidence-backed relationship between a CeilingZone and a CeilingFinishDefinition.

### SpecialCeilingGeometry
Extra geometry needed for a non-flat ceiling, for example slope direction, high/low levels or multiple planes.

### Bulkhead
A dropped/boxed ceiling element with an underside and often vertical faces.

### SoffitZone
A measurable underside surface such as an external canopy or balcony soffit.

### CeilingEvidenceRef
Traceable source evidence from a drawing, schedule, specification, legend, note or section.

### CeilingQuestion
A user-facing question created when strong evidence conflicts or essential information is missing.

---

## 9. Core technical rule

> **AI reads and proposes. Code validates and measures. The user decides.**

The model can propose:

- ceiling-zone polygons;
- zone/room relationships;
- finish tags;
- ceiling type;
- slope/special classification;
- evidence links;
- high/low level text;
- likely schedule/specification mapping.

The model must not be the official source of:

- physical area;
- slope area calculation;
- perimeter length;
- scale;
- final BOQ quantity.

Official quantities come from validated geometry and deterministic rules.

---

## 10. Pre-AI extraction

Before a ceiling drawing is sent to the model, extract what code can get cheaply:

- text and coordinates;
- drawing title;
- level/floor name;
- ceiling codes;
- room labels;
- ceiling level text;
- spot levels;
- slope notes/arrows where vector-readable;
- vector linework;
- fills/colours;
- hatch signatures;
- obvious schedule/legend table text;
- section/detail references;
- source image/page dimensions;
- already confirmed FloorSpace polygons.

The model then receives the rendered image plus this structured context.

This improves speed, repeatability and traceability.

---

## 11. Ceiling finish resolution

Do not assume one method such as `C01` codes.

For every CeilingZone, collect all finish evidence and resolve it.

Example evidence order:

1. explicit ceiling code/tag attached to the zone;
2. explicit room/zone-specific schedule assignment;
3. colour/hatch + legend mapping;
4. direct material note attached to the zone;
5. room finish schedule;
6. project specification rule for the exact room/area;
7. normalized room-type rule;
8. general/default project rule.

This is a guide, not a hard-coded universal ranking. Source revision and project-specific instructions also matter.

If two strong sources disagree, create a conflict. Do not silently pick one.

---

## 12. Special ceilings

The plan must support at least:

- flat;
- sloped/raked;
- mono-pitch;
- vaulted;
- multi-plane;
- stepped/dropped;
- tray/coffer where geometry is measurable;
- partial suspended ceiling;
- ceiling island;
- exposed soffit;
- double-height ceiling;
- open-to-sky/no-ceiling;
- stair soffit;
- external soffit.

Each special case is described in `03-special-ceilings/`.

---

## 13. User editing

Everything that can affect quantity must be editable before confirmation.

The user can:

- add/delete a CeilingZone;
- reshape a polygon;
- split/merge zones;
- change room assignment;
- change ceiling type/finish;
- change ceiling code;
- change height/level;
- mark flat/sloped;
- correct high/low levels;
- change slope direction;
- mark open-to-sky/no-ceiling;
- edit a bulkhead/soffit;
- change schedule/specification mapping;
- accept or reject an AI suggestion.

When an accepted input changes, Quanto recalculates every dependent result.

---

## 14. Scale and coordinates

Use the same principle as Floor.

- AI geometry is returned in the source image/page coordinate system.
- Source width/height is saved with the result.
- Canvas coordinates are only a display transform.
- World coordinates come from the confirmed drawing transform/scale.
- Zooming or resizing the canvas never changes real measurement.

If an RCP is a separate drawing from the floor plan, it must be aligned to the correct FloorLevel before room relationships are treated as confirmed.

---

## 15. Validation

Validate at several levels.

### JSON/schema

- required fields exist;
- coordinates are valid;
- IDs are unique;
- enum values are valid.

### Geometry

- polygons close correctly;
- no self-intersections;
- no impossible overlap between mutually exclusive zones;
- zone is inside a plausible ceiling coverage area;
- holes/open-to-sky regions are treated correctly.

### Topology

- zones reconcile with rooms or explicitly explain why they do not;
- multiple finish zones inside a room should cover the intended ceiling without unexplained gaps;
- special ceiling planes must share logical boundaries.

### Evidence

- finish assignment has a source;
- code exists in the project finish library;
- schedule/specification references are valid;
- conflicting strong evidence is visible.

### Measurement

- scale/transform is confirmed;
- flat area comes from geometry;
- sloped area comes from deterministic geometry/levels;
- derived lengths come from accepted edges.

---

## 16. Downstream integration

### Dimension

Shows confirmed ceiling quantities with traceable source and geometry.

### Workbook

Groups by project hierarchy, level, ceiling type, finish and zone/room as needed.

### 3D

Creates a simple visual ceiling plane/mesh using polygon + level + slope information. It is not required to become a full BIM authoring system.

### Review

Shows geometry, finish, evidence, confidence, conflicts and quantity together.

### BOQ

Only confirmed measured work reaches the BOQ. A user edit invalidates and recalculates dependent quantity projections.

---

## 17. Implementation order

Build in this order:

1. read FloorLevel/FloorSpace dependency;
2. ceiling-source binding and RCP detection;
3. no-RCP room-geometry reuse path;
4. ceiling-zone detection on RCP;
5. geometry validation/alignment;
6. finish library extraction;
7. finish evidence resolution;
8. user editing and confirmation;
9. deterministic flat-ceiling measurement;
10. special ceilings;
11. bulkheads/soffits;
12. Dimension/Workbook/3D/Review/BOQ projections;
13. tests and real QS comparison.

Do not start with every special case at once. Get the normal flat-ceiling path reliable first, then add special geometry.

---

## 18. Acceptance target

Ceiling is not complete just because the model returns JSON.

It is complete only when:

- normal rooms are reused correctly when no RCP exists;
- RCP zones align correctly when an RCP exists;
- open-to-sky/void/double-height cases are not measured incorrectly;
- finish evidence resolves across different drawing conventions;
- special ceilings calculate actual surface area correctly;
- user edits propagate everywhere;
- every quantity is traceable;
- real drawing packages match a QS takeoff within agreed tolerance.

See `05-shared-ceiling-system/implementation-and-testing.md` for the full test plan.
