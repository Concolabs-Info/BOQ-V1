# Floor Detection — Technical Method

This file explains how the application finds floor geometry from a PDF. It uses pre-AI extraction first, then model reasoning for difficult interpretation, then deterministic geometry code for validation and measurement.


## Possible source types

## PURPOSE

List where Floor information may appear so the application is not built around one drawing
style.

## GEOMETRY SOURCES

Primary:

- architectural floor plan;
- dedicated floor-finish plan;
- enlarged room/area plan when it is the controlling detail.

Supporting only:

- sections for split levels / ambiguous stair conditions;
- details for thresholds/upturns/build-ups;
- elevations only when they clarify a floor edge or level condition.

## FINISH / FLOOR-WORK SOURCES

- floor finish schedule;
- room finish schedule;
- material schedule;
- legend/key;
- colour key;
- hatch/pattern key;
- tags/marks in the plan;
- direct material text inside a region;
- keynotes and keynote legends;
- general notes;
- written specification;
- finish/build-up detail;
- room data sheet;
- project-specific code tables.

## COMMON DRAWING STYLES THE SYSTEM MUST SUPPORT

- one room = one finish code;
- one room = several finish zones;
- finish shown only by colour;
- finish shown only by hatch/pattern;
- finish shown by text, no code;
- finish schedule maps finish code -> material;
- room schedule maps room -> finish code;
- specification maps room type -> finish system;
- one typical plan covers several physical floors;
- separate finish plan is not perfectly aligned with architectural plan;
- scanned/raster drawing with no usable vector text;
- mixed PDF: some vector, some raster;
- abbreviations/misspellings/project-specific room names;
- internal + external floor finishes on the same plan.

## RULE

A new drawing convention should normally create a new **binding/extractor configuration**, not
a new Floor workflow.


## Pre-AI PDF extraction

## PURPOSE

Extract cheap, reliable evidence before the vision-model call.

## PIPELINE

### 1. Render the exact controlling viewport

Create a high-quality image with fixed source dimensions. Store the PDF-to-image transform.
The prompt output must use this image coordinate system.

### 2. Extract native PDF text when available

For every text run keep:

```text
raw_text
bbox_px
font size/style if useful
source page/viewport
```

Repair known PDF text issues such as split tokens/fraction glyphs when deterministic repair is
safe. On raster sheets use OCR only as an evidence source, not as unquestioned truth.

### 3. Classify useful text candidates

Use simple parsers/pattern discovery to mark likely:

- room labels;
- room numbers;
- finish tags;
- level names;
- dimensions;
- printed areas;
- UP/DN/stair labels;
- VOID / OTB / shaft labels;
- notes and keynotes.

Do not decide the final meaning yet.

### 4. Extract vector geometry when available

Keep candidate:

- line/path segments;
- closed filled shapes;
- wall-face/wall-mass hints;
- opening gaps;
- vector fills/colours;
- hatch/pattern resources if the PDF library exposes them.

These are helpers. Do not assume every line is a wall.

### 5. Extract raster visual signatures

When useful:

- dominant fill colours by region;
- connected colour regions;
- hatch/pattern texture signatures;
- line-density / wall-mass masks.

Meanings come later from the legend/schedule.

### 6. Build compact coordinate-aligned context

Example sent with the image:

```text
source image: 2589 x 2965 px
text evidence:
  T31 bbox=(420,310,610,350) text="BEDROOM 01"
  T32 bbox=(470,360,520,390) text="F03"
  T77 bbox=(900,420,970,450) text="TOI"
  T78 bbox=(920,460,970,490) text="F05"
likely opening spans: O1 ...
likely wall geometry: compact references ...
colour/hatch candidates: C1 ...
```

Do not send thousands of raw vector operations if they add noise. Keep the full extraction in
the database and send a compact summary + IDs to the model.

### 7. Cache by content hash

Cache render/extraction using source asset + viewport + revision + extraction version. Repeated
Floor runs should not re-extract unchanged PDF evidence.

## WHY THIS HELPS

- model does less OCR;
- coordinates are easier to associate with rooms;
- vector evidence independently checks model geometry;
- finish tags/labels are less likely to be missed;
- cheaper reruns;
- easier debugging because every input is inspectable.


## Source binding

## PURPOSE

Tell the fixed Floor flow which project sources carry each kind of evidence.

## BINDING OBJECT

One binding is created per controlling floor plan/typical group.

```text
FloorSourceBinding
  floor_level_refs[]
  architectural_plan_viewport_id
  finish_plan_viewport_ids[]
  room_finish_schedule_regions[]
  finish_schedule_regions[]
  legend_regions[]
  specification_clause_regions[]
  detail_regions[]
  vector_mode
  registration_to_arch_plan for secondary plans
  revision_set
```

## HOW BINDINGS ARE CREATED

1. Use Pre page/viewport classification.
2. Search titles and nearby text for likely floor-finish/schedule/legend evidence.
3. Let a small model/classifier propose relationships when the package is unclear.
4. Validate that linked sources belong to the same level/range/revision where stated.
5. Keep missing bindings as `none`; never invent a source.

## SECONDARY FINISH PLAN REGISTRATION

If a finish plan is separate from the architectural plan:

- identify shared control points/geometry;
- estimate a transform;
- validate against several points, not one;
- store registration confidence and residual error;
- do not transfer finish polygons if registration is poor; ask/review instead.

## TYPICAL FLOORS

A typical plan may control multiple physical levels only when the drawing/Pre evidence states
that applicability. Store one geometry template plus explicit level instances. A dedicated plan
for one level overrides that level only.

## FAILURE RULE

A source with unknown level/revision relationship cannot silently assign finish data to every
floor. It becomes a guidance/anomaly question depending on the evidence.


## Detection strategy

## PURPOSE

Translate the SOP into a production pipeline.

## INPUTS

- FloorSourceBinding;
- rendered source crop and PDF-image transform;
- pre-extracted coordinate text;
- vector/colour/hatch/opening hints where available;
- confirmed Pre scale and level references.

## DECISIONS

**D1. Use a staged hybrid pipeline.**

```text
Pre evidence extraction
  -> main semantic/geometry model call
  -> strict schema validator
  -> deterministic geometry/topology validator
  -> independent coverage checks from vector/text evidence
  -> targeted verifier crops for suspicious regions
  -> reconciliation with canonical/user-confirmed objects
  -> publish Candidates / accepted FloorSpaces
```

**D2. Model output is source-coordinate geometry, not official measurement.**  
The response is tied to exact `source_image.width_px/height_px`. Accepted geometry is transformed
to world mm after validation.

**D3. Use one main floor-geometry prompt, not one prompt per room.**  
The full plan view is needed to understand walls, circulation, voids and adjacency. Targeted crops
are used only for verification/repair of suspicious regions.

**D4. Keep independent evidence channels.**  
The model sees the plan image and coordinate context, but code separately keeps wall/vector/text
hints. Agreement raises confidence; disagreement triggers review.

**D5. Coverage is checked as a graph/problem, not just polygon syntax.**  
Build adjacency relations between spaces/openings and compare detected surfaces with a rough
floor-surface envelope/cell decomposition. Look for unexplained interior gaps and impossible
wall crossings.

**D6. Label recovery cannot invent geometry.**  
If strong room text exists but the model missed a space, code may propose a wall-bounded cell only
when existing geometry supports it. A label alone must not draw a fake room.

**D7. Targeted verifier has a narrow job.**  
For each failed region show an overlay crop and ask only:

- missed space?
- wrong boundary?
- wrong floor/non-floor classification?
- wrong label association?
- wrong special-region interpretation?
- no change?

Replacement geometry must pass the same deterministic checks.

**D8. Reconciliation protects user edits.**  
Match new detections by level + geometry overlap + label/position. User-confirmed objects are not
automatically replaced. Conflicts become questions.

**D9. Confidence is split.**  
Store at least geometry confidence and semantic/classification confidence. A perfect polygon with
an unreadable label is not the same as an uncertain polygon.

**D10. AI reruns are capped.**  
After a small number of targeted retries, unresolved cases go to the surveyor. Do not loop until
the model happens to agree.

## PERFORMANCE DESIGN

- render/extract once and cache;
- one main model call per controlling floor crop;
- batch targeted verifier crops;
- do geometry measurement locally;
- reuse a typical floor template only where applicability is explicitly stated;
- do not resend unchanged schedules/specifications with every floor call.

## OUTPUT

The detector publishes structured Candidates for:

- FloorSpaces;
- FunctionalZones;
- ConnectorFloorRegions;
- SpecialFloorRegions;
- NonFloorRegions;
- FloorObstructions;
- OpeningSpans;
- text/finish evidence;
- questions/review items.

No BOQ quantity is created until geometry and required classification are resolved.


## Detection contract

The strict machine-readable schema is `../schemas/floor-detection-v3.schema.json`.

## WHY THE RESPONSE IS SPLIT

`spaces` are the main room/usable areas. Special cases are separate so measurement can explain
exactly where every square metre comes from.

```text
spaces                    main physical rooms/areas
functional_zones          use labels inside open-plan spaces
connector_floor_regions   door/opening strips through walls
special_floor_regions     under-stair floor, landings/recesses/etc.
non_floor_regions         void/open-to-below/shafts/openings
obstructions              columns/plinths/etc.
openings                   door/large-opening spans
text_evidence              labels/dimensions/areas/notes
finish_visual_evidence     tags/colours/hatches/material notes visible on plan
review_items               uncertainty that must not be hidden
```

## CANONICAL GEOMETRY

The model response is source-pixel geometry. After acceptance:

```text
polygon_px + confirmed viewport transform -> polygon_world_mm
```

Store both. Do not replace `polygon_px` with canvas coordinates.

## OFFICIAL QUANTITY

No official `area_m2` field exists in the model schema on purpose. The geometry measurement service
calculates area/perimeter/length from world geometry and records the calculation in the MWO ledger.
