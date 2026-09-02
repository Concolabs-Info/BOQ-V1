# Shared Floor System — Evidence and Source Handling

All Floor elements use the same evidence approach. Quanto keeps the source page/region, extracted fact, confidence and scope so a QS can see why a floor, room, finish or related work was assigned.


## Source types

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


## Pre-AI extraction

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


## Evidence, rules and questions

## EVIDENCE PRINCIPLE

Every extracted/confirmed fact keeps its source. Example:

```text
finish_code F05
  source: finish schedule row 8

zone assignment F05
  source: blue hatch on finish plan + legend swatch

skirting height 100mm
  source: room finish schedule cell
```

## QUESTION TYPES

### anomaly
Something conflicts or looks implausible.

Examples:

- room schedule says F03 but plan tag says F05;
- model polygon crosses a wall;
- a void label sits inside an accepted floor finish zone;
- secondary finish plan registration is poor.

### guidance
Information needed to finish the takeoff is absent.

Examples:

- skirting type/height not stated;
- threshold between different finishes is unclear;
- waterproofing extent is not given;
- floor finish code exists but no definition can be found.

## QUESTION CONTENT

Each question should contain:

- affected object IDs;
- short human-readable issue;
- relevant source crop(s)/bbox(es);
- proposed options when safe;
- no hidden default.

## RULE VERSIONING

Measurement/classification/description/aggregation rules are data and have versions. A rule fix
should allow re-billing confirmed geometry without rerunning AI extraction.
