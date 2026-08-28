# Floor Planning and Implementation Plan

This is the main plan for the Quanto Floor takeoff system. It explains what the Floor module covers, the decisions already made, the object model, the full workflow, source handling, open questions and how the result reaches Dimension, Workbook, 3D, Review and BOQ. Read this first.


## Purpose and scope

This folder is the complete plan for building the **Floor** part of Quanto.

Floor means the measurable floor finishes and floor-related works. It does **not** mean the
structural slab. Slab stays in the Slab takeoff child.

The plan is written in simple words, but it is detailed enough for an engineer to build from.
It follows the same idea used by Pre and Columns:

1. decide what a real QS needs;
2. decide where the evidence can appear;
3. define a fixed flow that works across different drawing styles;
4. let AI read and interpret difficult evidence;
5. let deterministic code validate geometry and calculate quantities;
6. let the surveyor confirm uncertain cases;
7. keep every result traceable to the drawing/specification that produced it.

## Read this first

| File | Purpose |
|---|---|
| `00-decision-log.md` | What is already decided for Floor |
| `01-vocabulary-and-object-model.md` | Common Floor terms and objects |
| `00-floor-master-plan.md` | The full Floor workflow in one document |
| `03-source-binding-and-pre-ai/` | What we extract before AI and how sources are connected |
| `04-floor-detection/` | Detect rooms, usable floor surfaces, special areas and voids |
| `05-floor-finishes/` | Resolve floor finishes from plans, colours, hatches, schedules and specifications |
| `06-screeds/` | Screeds, beds and toppings |
| `07-skirtings/` | Skirting detection and measurement |
| `08-waterproofing/` | Floor waterproofing and boundary work |
| `09-other-floor-works/` | Underlays, insulation, membranes, coatings and similar works |
| `10-shared-integration/` | Dimension, Workbook, 3D, Review and BOQ |
| `11-implementation/` | Technical services, database/API/jobs, tests and build order |
| `prompts/` | Production prompt contracts |
| `schemas/` | JSON schemas for model output |
| `12-acceptance-checklist.md` | What must pass before Floor is called complete |
| `13-open-questions.md` | Decisions still to settle |

## Core rule

**AI reads. Code measures. The surveyor decides.**

A model may propose a room polygon, room type, finish tag, colour meaning or schedule link.
It does not produce the official measured area or BOQ quantity.

The official quantity always comes from validated geometry + confirmed scale + versioned
measurement rules.


## Decisions

## PURPOSE

Record the Floor decisions already made so later implementation does not keep reopening them.

## DECISIONS

**D1 — Floor means finishes and related floor works, not structural slab.**  
The Floor workflow owns floor-finish areas and floor-derived works such as screed, skirting,
waterproofing and other specified floor layers. Structural concrete belongs to Slab.

**D2 — The main geometry starts from rooms/spaces, not from the whole slab outline.**  
This naturally excludes wall thickness from floor-finish area. The detector traces the actual
walkable/measurable surface inside walls.

**D3 — Room polygons are not enough by themselves.**  
The detector must also find special floor surfaces normally missed by room polygons:

- door threshold / wall-opening floor strips;
- valid floor under stairs, especially at ground floor;
- landings and recesses;
- balconies, terraces, verandahs and external landings;
- open-plan finish zones where no wall separates uses.

It must also identify non-floor regions such as:

- voids and open-to-below areas;
- lift/stair openings where no floor exists;
- shafts/open wells;
- other genuine holes in the floor surface.

**D4 — Balconies and terraces are floor surfaces when they have a finish.**  
They are classified as external/semi-external floor areas, not discarded because they are not
enclosed rooms.

**D5 — The model receives a rendered plan plus pre-extracted context.**  
Before the AI call, code extracts useful PDF text with coordinates, vector lines/fills when
available, colour/hatch candidates, dimensions, floor identity and likely tags. This reduces
model work and improves consistency.

**D6 — Never hardcode one drawing convention.**  
One project may use `F01`, another colour fills, another hatch patterns, another a room-finish
schedule, and another only specification prose. The flow stays fixed; source bindings change.

**D7 — Room type is normalized, but original wording is always preserved.**  
`TOI`, `WC`, `W.C.`, `Toilet`, etc. may map to a normalized type such as `toilet`, while the
raw printed label remains evidence. Classification uses labels + symbols + context, not a word
list alone.

**D8 — Finish assignment is a separate step from room detection.**  
Floor detection may capture likely finish evidence, but it does not decide the final finish.
The Floor Finish flow builds finish definitions and resolves them against spatial zones.

**D9 — Schedules/specifications define types; plans usually define location.**  
Examples:

- plan `F03` + schedule `F03 = porcelain tile`;
- blue fill + legend `blue = F05` + schedule `F05 = vinyl`;
- room `Bathroom` + room schedule `Bathroom = F02`;
- specification `all wet rooms receive X` + normalized wet-room spaces.

**D10 — Every assignment keeps the reason.**  
A finish, screed, skirting or waterproofing result must store the source evidence used to
make it. Conflicting evidence becomes a question; it is not silently overwritten.

**D11 — Canvas size does not control measurement scale.**  
Model geometry is stored in source-image pixels and accepted geometry in world millimetres.
Canvas coordinates are only a display transform. Zooming or resizing the canvas never changes
measurement.

**D12 — Official quantities are deterministic.**  
Code calculates area, perimeter and length after geometry and scale validation. Models do not
return trusted physical quantities.

**D13 — User edits are first-class truth.**  
A confirmed user correction is not deleted by a later AI rerun. Re-analysis produces a
conflict/question when it disagrees with confirmed geometry or classification.

**D14 — Latest Floor scope includes skirting as a Floor-derived workstream.**  
The current demo UI text says skirting is not shown in the Floor child, but the latest planning
instruction requires a skirting plan derived from Floor geometry. Backend/domain planning in
this folder includes it. The final UI placement must be reconciled before implementation.

## OPEN

See `13-open-questions.md`.

## FALSIFICATION

If a real project requires changing the basic sequence rather than only changing source
bindings or evidence rules, the Floor flow is not universal enough and must be revised.


## Vocabulary and object model

## PURPOSE

Use one name for each concept so prompts, backend, frontend and BOQ logic do not drift.

## MAIN OBJECTS

### FloorLevel
One physical building level, for example Ground, First or Level 06.

### FloorPlanViewport
The exact plan crop used as the coordinate source for a level or typical-level group.

### FloorSurfaceEnvelope
A coverage/checking outline of all physical floor surfaces on the plan. It may include
internal rooms, balconies, terraces and landings. It is not the structural slab quantity.

### FloorSpace
A usable spatial area bounded mainly by inner wall faces or a real external floor edge.
Examples: bedroom, bathroom, corridor, balcony, terrace, store.

Key facts:

- `raw_label` — exactly what the drawing says;
- `normalized_type` — standard internal type such as `bedroom`, `toilet`, `balcony`;
- `environment` — internal / external / semi_external;
- `polygon_px` — source-image coordinates;
- `polygon_world_mm` — accepted measurement coordinates;
- source evidence and confidence.

### FunctionalZone
A use label inside a physical open space where no real wall exists, for example Living /
Dining / Kitchen inside one open-plan polygon. It does not automatically create a separate
physical room.

### ConnectorFloorRegion
A real floor strip that connects spaces but is easy to miss when room polygons close at wall
faces. Main example: the strip under a door/opening through wall thickness.

### SpecialFloorRegion
A floor surface needing special interpretation, for example under-stair floor, a bay/recess,
an external landing or a raised/lowered local zone.

### NonFloorRegion
A place inside/near the plan where there is no measurable floor surface: void, open-to-below,
stair opening, lift shaft opening, open well, etc.

### FloorObstruction
A physical object occupying part of a floor surface, for example a column or large plinth.
It is recorded as geometry evidence. Measurement rules decide later whether to deduct it.

### FinishDefinition
One project finish type, such as `F03 — 600x600 porcelain tile`. This is a library fact, not
a room.

### FinishZone
The spatial area carrying one finish. It can reference a whole FloorSpace or have its own
polygon when a room has multiple finishes.

### FloorWorkDefinition
A reusable definition for screed, waterproofing, underlay, insulation, membrane, coating,
etc.

### FloorWorkCoverage
The geometry/location where one FloorWorkDefinition applies. It should reference existing
space/finish geometry when possible instead of copying polygons.

### PerimeterEdge
A canonical world-coordinate boundary edge of a FloorSpace/FinishZone. Used for skirting and
waterproofing boundary work.

### OpeningSpan
A doorway/full-height opening span on a perimeter edge. Used to explain skirting exclusions and
connector strips. It can later reconcile with the Doors & Windows element.

### EvidenceRef
A traceable source fact:

```text
sheet_id
viewport_id
bbox / polygon
raw_text if any
source_kind
revision
confidence
```

### Candidate
Something extraction thinks may be correct. It is not yet user-confirmed commercial truth.

### MeasuredWorkObject
The repo-wide confirmed measurable object that becomes Workbook/BOQ quantity through rules.

## RELATIONSHIP SUMMARY

```text
FloorLevel
  -> FloorPlanViewport
  -> FloorSpace
       -> ConnectorFloorRegion / SpecialFloorRegion / NonFloorRegion
       -> FinishZone
            -> FinishDefinition
            -> FloorWorkCoverage -> FloorWorkDefinition
       -> PerimeterEdge -> Skirting / Waterproofing boundary work

All facts -> EvidenceRef
Validated measurable facts -> MeasuredWorkObject
```


## End-to-end Floor workflow

## PURPOSE

This is the whole Floor workflow in one place. It is the fastest document to read before
implementation. Supporting folders give deeper details.

## INPUTS FROM PRE

Floor must consume these confirmed Pre outputs instead of solving them again:

- included drawing files, sheets and revisions;
- floor-plan viewports and page crops;
- level identity and typical-floor applicability;
- confirmed drawing scale/calibration;
- specification/schedule documents and useful regions;
- source asset IDs and image/PDF transforms.

## FULL FLOW

```text
1. Bind Floor sources for each level
2. Pre-extract PDF/image evidence
3. Detect physical floor spaces
4. Detect special floor surfaces and non-floor regions
5. Validate geometry/topology
6. Normalize room/space semantics
7. Build floor-finish library from schedules/legends/specifications
8. Detect/resolve finish zones on the plan
9. Resolve screed/beds/toppings
10. Resolve waterproofing
11. Resolve other floor layers/works
12. Build perimeter edges and resolve skirting
13. Apply measurement rules with code
14. Verify coverage, conflicts and missing information
15. Project to Dimension / Workbook / 3D / Review / BOQ
16. Recalculate only affected dependencies after edits
```

## STEP 1 — BIND THE SOURCES

For each floor/typical group, create one binding record. Example:

```text
architectural_plan:      A-102 viewport 3
floor_finish_plan:       ID-201 viewport 1, or none
room_finish_schedule:    ID-601 table 2, or none
finish_schedule:         ID-602 table 1, or none
finish_legend:           ID-201 legend region, or none
specification_clauses:   spec pages 120-127, or none
relevant_details:        A-512 details 4/5, or none
file_mode:               vector | raster | mixed
```

The flow does not change if one of these is missing.

## STEP 2 — PRE-EXTRACT BEFORE AI

Use deterministic tools first:

- PDF text with bounding boxes;
- vector paths/lines/fills where available;
- page/crop dimensions;
- dimension strings and level notes;
- likely room labels and finish tags;
- colour clusters and hatch signatures;
- table cells from schedules/legends;
- raster render for the model.

Do not flood the model with raw PDF internals. Send a compact coordinate-aligned context plus
the original rendered crop.

## STEP 3 — DETECT THE FLOOR SPACES

The model proposes:

- every physical room/space polygon;
- raw room label and normalized room type;
- internal/external/semi-external status;
- functional open-plan zones;
- balconies/terraces/verandahs/external landings;
- doorway/large-opening connector strips;
- valid under-stair floor areas;
- stair/lift openings and voids;
- shafts/open wells and other non-floor areas;
- obstructions such as columns where visible;
- adjacency and opening relationships;
- finish tags/colour/hatch evidence visible in each area;
- uncertainty/review items.

The model never returns trusted area/perimeter values.

## STEP 4 — SPECIAL FLOOR RULES

### Doorways
Room polygons should close at the logical room threshold rather than include wall thickness.
The strip of floor through the door/opening is recorded as a separate connector region so it
is not lost. Finish resolution later decides which finish owns it or whether it is split.

### Under stairs
At Ground, there may be a real finished floor below the stair. Include it if the drawing shows
an accessible/walkable floor surface. At upper levels the stair opening may be a void. If the
plan alone cannot tell, use stair/section evidence or ask a question.

### Balconies and terraces
Include when they have a physical floor surface. Classify as external/semi-external and resolve
their finish separately.

### Open-plan areas
Do not invent walls. Keep one physical FloorSpace and separate functional/finish zones when
needed.

### Voids and shafts
Mark as NonFloorRegion. Do not treat every symbol as a void; require visual/text/context
evidence.

## STEP 5 — VALIDATE BEFORE MEASUREMENT

Code checks:

- JSON/schema validity;
- source image dimensions match exactly;
- all polygons in bounds;
- no self-intersections/zero-area shapes;
- no impossible peer overlaps;
- room boundaries generally follow wall inner faces or real external floor edges;
- polygons do not run through obvious wall mass;
- obvious enclosed/walkable regions are not missing;
- connector strips match an opening/wall passage;
- void/non-floor regions are topologically sensible;
- labels are spatially associated with the claimed spaces;
- printed dimensions/areas are independent checks only;
- source/typical-level mapping is not duplicated.

Failures trigger targeted AI review or a user question. Do not silently repair semantic
uncertainty.

## STEP 6 — NORMALIZE ROOM TYPES

Keep the original label and create a normalized type. Examples:

```text
TOI / WC / W.C. / Toilet -> toilet
Bath / Bathroom          -> bathroom
Ens / Ensuite            -> ensuite
Bed / BR / Bedroom       -> bedroom
Kit / Kitchen            -> kitchen
Liv / Lounge             -> living
Bal / Balcony            -> balcony
Terr / Terrace           -> terrace
```

Use label + sanitary/furniture symbols + adjacency + room layout + project schedule context.
The alias dictionary helps; it is not the sole decision maker.

## STEP 7 — BUILD THE FINISH LIBRARY

Extract project finish definitions from any relevant source:

- floor finish schedule;
- room finish schedule;
- legend/key;
- direct plan notes;
- specification clauses;
- details;
- keynote/material references.

Store mark, material, description, thickness, size/module, background, bedding/backing,
internal/external use, falls, related screed, related skirting and any other stated facts.
Unknown stays unknown.

## STEP 8 — RESOLVE FINISHES TO GEOMETRY

Possible evidence paths include:

```text
F03 printed in room -> finish schedule F03 -> FinishDefinition
blue region -> legend blue = F05 -> finish schedule F05 -> FinishDefinition
Bedroom 02 -> room schedule says Bedroom 02 = F02
normalized bathroom -> specification says all bathrooms = ceramic tile
plain text “epoxy floor finish” -> bounded plan zone -> direct finish definition
```

Suggested authority order:

1. user-confirmed value;
2. exact room/space schedule assignment;
3. explicit finish mark/tag on controlling plan;
4. explicit bounded material note/detail;
5. specification rule tied to exact room(s)/level(s);
6. legend-backed colour/hatch;
7. room-type rule explicitly stated in schedule/specification;
8. general default note;
9. suggestion/review only.

Comparable conflicting evidence becomes an anomaly question.

## STEP 9 — SCREED

Do not assume every finish has screed. Resolve it from schedule/specification/build-up/detail.
Coverage may equal a finish zone or have its own polygon. If equal, reference the existing
geometry. Code applies NRM2 width/slope rules.

## STEP 10 — WATERPROOFING

Do not infer waterproofing only because a room is called Bathroom. The room type can help find
a rule, but confirmation must come from specification/schedule/detail/plan evidence. Measure
horizontal coverage separately from boundary/upturn work.

## STEP 11 — OTHER FLOOR WORKS

Use the same library + coverage pattern for:

- underlays/backings;
- isolation membranes;
- floor insulation;
- sealers/coatings/surface treatments;
- other explicit floor layers.

Do not map a generic word like `underlay` to a work section without knowing its actual
material/function.

## STEP 12 — SKIRTING

Skirting is mainly derived from validated floor-space boundary edges:

```text
room perimeter
- door/full-height opening spans
- edges explicitly excluded by project evidence
= net skirting run
```

The skirting type/height/profile comes from schedule/specification/detail, not geometry alone.
Do not globally assume “no skirting behind cabinets”; that needs project evidence.

## STEP 13 — MEASUREMENT

Convert accepted source geometry to canonical world millimetres using the confirmed Pre
transform. Calculate geometry with code. Apply versioned rules afterwards.

Important Floor NRM2 facts already extracted in this project:

- WS28 Item 1: screeds/beds/toppings, m or m², split at 600 mm width;
- WS28 Item 2: finish to floors, m or m², split at 600 mm width;
- WS28 Item 14: skirtings, measured in m, net height stated;
- WS28 includes work in forming voids/holes ≤1 m², so do not blindly deduct every tiny hole;
- WS19 waterproofing: coverings >500 mm wide in m², ≤500 mm wide in m;
- WS19 no deduction for voids ≤1 m²; boundary work is separate.

The rule engine owns these rules; prompts do not.

## STEP 14 — QUESTIONS

Two types:

- `anomaly` — two sources conflict or geometry looks wrong;
- `guidance` — required information is absent.

Every question must show the drawing/specification evidence that caused it.

## STEP 15 — PRODUCT PROJECTIONS

### Dimension
Show source plan and Floor overlays. User can move vertices, change type, add/remove zones and
answer questions. Display coordinates are never canonical measurement coordinates.

### Workbook
Group confirmed MWOs by family + floor/typical group. Keep gross/deductions/net and full
precision. One row must link back to all source zones/edges.

### 3D
Use the same canonical IDs. Floor finish zones appear as thin surface overlays at their level.
3D is a view, not a second geometry store.

### Review / BOQ
Review shows confirmed quantities and unresolved questions. BOQ is produced by rule-based
aggregation from the same MWOs, not remeasured.

## STEP 16 — EDITS AND RE-ANALYSIS

Dependency-scoped invalidation:

- edit room polygon -> recalc its finish zones, linked floor works and skirting edges;
- edit finish schedule -> rebuild affected definitions and re-resolve assignments;
- change scale -> invalidate all world quantities for that viewport;
- edit one finish type -> update all zones using that definition;
- user-confirmed geometry -> preserved across AI rerun unless user explicitly replaces it.

## DONE WHEN

Floor is complete only when the acceptance checklist in `12-acceptance-checklist.md` passes
on a varied real-project test set, including vector, raster, colour-coded, schedule-driven,
open-plan, balcony/terrace, under-stair and void cases.


## Source map

This planning package was reconciled from the project material supplied by the user.

## MAIN PROJECT REFERENCES

- `docs/planing/README.md` — planning method and done-tests.
- `docs/planing/columns/` — research -> human SOP -> machine strategy pattern.
- `docs/pre/` — confirmed Pre responsibilities: ingest, triage, levels, scale, height,
  specifications.
- `docs/00-architecture.md` — Candidate -> MeasuredWorkObject; AI reads, code measures; rule
  layers; source evidence; world-mm units.
- `demo-ui-plan/takeoff/floor/` — current Floor Dimension/Workbook/3D UI contract.
- old AutoBOQ Floor/Floor Finishes/Floor Works code — useful implementation experiments:
  coordinate-aligned text, strict model schemas, room/wall-cell recovery, finish schedule/colour/
  hatch adapters, skirting and evidence services.
- project NRM2 extracted text — WS28 and WS19 measurement facts used by the rule-plan sections.

## LATEST USER DECISIONS INCLUDED

- room/space floor geometry is the main base;
- walls should not be counted in floor finish area;
- door threshold floor strips must be captured;
- real floor below stairs, especially Ground, must be captured;
- balconies/terraces are valid Floor surfaces;
- voids/open-to-below/shafts must be explicit;
- room names need universal normalization plus raw labels;
- pre-extract text/coordinates before AI;
- finish assignment must support code, colour, hatch, schedule, specification, room rules and plan
  text;
- skirting is planned as its own Floor-derived workstream;
- model outputs JSON/polygons; code validates and measures; canvas display must not affect scale.


## Open questions and falsification checks

Only questions that still affect implementation are kept here.

## BLOCKING BEFORE UI IMPLEMENTATION

### 1. Where skirting appears in the final UI

Latest planning scope includes skirting as a Floor-derived workstream, but the existing demo Floor
UI says skirting is not in the Floor child. Backend planning supports skirting either way. Final
navigation/workbook placement must be decided before UI build.

### 2. Exact auto-confirm thresholds

Geometry/semantic/finish confidence thresholds must be set from the golden dataset, not guessed.
The pipeline can be built before final numbers are chosen.

### 3. Finish transition ownership at unresolved door thresholds

When two finishes differ and no threshold detail/line is shown, should the product always ask, or
is there a project-configurable default? Recommended default for v1: ask.

## NON-BLOCKING / EVALUATION-DRIVEN

### 4. Curved geometry native support

v1 can store curved edges as sufficiently accurate polygon vertices. Native arcs can be added if
real packages show a material accuracy/performance need.

### 5. Printed-area/dimension mismatch tolerance

Keep configurable and tune against real QS-reviewed examples.

### 6. Full automatic secondary-plan registration

Implement assisted/validated registration first. If automatic registration is unreliable, expose
control points to the user without changing the Floor workflow.

### 7. Whether to show procurement waste/order quantity

Not needed for NRM measured BOQ. Can be a later optional readout.
