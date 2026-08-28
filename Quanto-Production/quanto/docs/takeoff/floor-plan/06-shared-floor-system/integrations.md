# Shared Floor System — Dimension, Workbook, 3D, Review and BOQ

This file explains how confirmed Floor data moves through the rest of Quanto. The same source geometry and measured objects must drive every view so editing one item updates all dependent outputs.


## Dimension

## PURPOSE

Show and edit the same canonical Floor objects used for measurement.

## DISPLAY RULE

Canvas geometry is a **projection**, not the source of truth.

```text
source polygon px
  -> validated world geometry mm
  -> viewport/canvas transform for display
```

Zoom, fit-to-screen and browser size never change measured quantities.

## WHAT TO SHOW

- controlling plan/finish/schedule/specification source;
- FloorSpace/FinishZone overlays;
- connector floor regions when useful;
- deduct/non-floor overlays;
- finish type mark and live code-calculated area;
- evidence boxes on schedules/legends/specification clauses;
- review/questions.

## USER ACTIONS

- move vertex/edge;
- add missing zone;
- remove/deduct a region;
- change finish type without redrawing;
- inspect raw room label/normalized type/evidence;
- answer anomaly/guidance questions;
- inspect special cases such as doorway strip/under-stair region;
- restore/revert history.

## EDIT BEHAVIOR

A geometry edit creates a new geometry revision, recalculates dependent quantities and clears
confirmation only for affected objects/rows. It does not rerun the whole project.

## EVIDENCE NAVIGATION

Clicking a finish family or source should jump to the schedule/legend/specification region that
created it. Every automatic decision should be explainable from the UI.


## Workbook

## PURPOSE

The Workbook is the auditable quantities register. It is not the final BOQ.

## GROUPING

Default working hierarchy:

```text
Floor work category / family
  -> physical floor or typical-floor group
     -> contributing measured objects
```

Examples:

```text
Floor finishes
  F01 porcelain tile
    Ground
    First
    Typical 2nd-6th

Screed
  SC01 50mm cement-sand to falls
    Bathrooms - First

Skirting
  SK01 100mm porcelain skirting
    First
```

Exact UI tree can be reconciled with the latest demo contract; the data model supports all of
these workstreams.

## ROW DATA

Every quantity row should keep/derive:

- family/type;
- floor/scope;
- unit;
- gross quantity;
- deductions with reasons;
- net quantity;
- calculation expression;
- source object IDs;
- confirmation state;
- evidence/source links;
- applicable factor for explicit typical-floor groups.

## IMPORTANT

- Full precision stays in workings.
- Editing a quantity manually must be recorded as a user override, not overwrite source geometry.
- `Show on drawing` highlights exactly the contributing zones/edges.
- Typical-floor factor is applied only to explicitly controlled physical levels.


## 3D

## PURPOSE

Use 3D as another view of the same Floor IDs, not a second takeoff system.

## GEOMETRY

- FloorSpace/FinishZone polygons are placed at their confirmed level elevation.
- Render floor finish as a thin surface/overlay, not as structural slab thickness.
- Different finish families can use different visual styles/colours.
- External floor spaces remain visible when their level is selected.
- Non-floor regions/voids appear as holes only where the geometry/rules say so.

## SOURCE OF HEIGHT/Z

Z position comes from confirmed project level data, not from model guessing. Local split-level
metadata can offset a region when supported.

## EDITING

Primary geometry editing stays in Dimension. 3D selects/highlights the same IDs and can navigate
back to the source drawing.

## CONSISTENCY TEST

A selected zone in 3D, Dimension and Workbook must resolve to the same canonical object ID and
quantity source.


## Review and BOQ

## REVIEW

Review receives the confirmed Floor MWOs plus unresolved questions/status. It does not recalculate
geometry.

For each work type show enough context to verify:

- type/family;
- floor/scope;
- measured quantity and unit;
- source drawing/specification;
- confidence/confirmation;
- unresolved conflict if any.

## BOQ

BOQ is a rule-based aggregation over the same MWOs.

```text
MWOs
  -> classification rule
  -> measurement/deduction rule
  -> description rule
  -> aggregation key
  -> BOQ line
```

Do not make the model write the final commercial description freehand. Use structured attributes
and templates.

## FLOOR-RELATED RULE TARGETS

At minimum support:

- WS28 screeds/beds/toppings;
- WS28 finish to floors;
- WS28 skirtings;
- applicable WS28 insulation/membrane/surface-treatment items;
- WS19 waterproofing coverings and boundary work.

## TRACEABILITY

Every BOQ row must expand back to:

```text
bill line
  -> contributing MWOs
  -> Floor/Finish/Edge geometry
  -> source evidence bbox/region
```

No bill quantity may exist only as a number typed by an AI response.


## Versioning and recalculation

## OBJECTS THAT NEED VERSIONS

- source asset/revision;
- viewport/crop transform;
- Pre scale/calibration;
- source binding;
- extracted evidence;
- AI prompt/model/config;
- geometry revision;
- finish/work definitions;
- assignments;
- measurement-rule version;
- user confirmation hash.

## DEPENDENCY RULES

### Scale changes
Invalidate world geometry and all quantities on that viewport. Keep source-pixel polygons so they
can be re-transformed without rerunning detection.

### Room geometry changes
Invalidate dependent finish-zone geometry where shared, connector/topology checks, skirting edges
and quantities for that room only.

### Finish schedule changes
Rebuild affected FinishDefinitions and assignments. Do not rerun floor-space geometry.

### Specification changes
Re-resolve only work types/scopes touched by changed clauses.

### Door geometry changes
Reconcile affected OpeningSpans/connector strips/skirting lengths.

### User confirmation
If source/model changes after confirmation, show stale/conflict state. Do not silently replace the
confirmed value.

## CACHE KEYS

Use content hashes + version identifiers so an unchanged viewport/evidence/prompt returns cached
extraction. This is important for speed and cost.
