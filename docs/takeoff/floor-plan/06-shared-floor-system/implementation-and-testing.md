# Shared Floor System — Implementation and Testing

This file gives the technical build order and the acceptance process. Implementation should follow the documented objects and contracts, then be proven against real drawing packages before Floor is considered production-ready.


## Technical architecture

## PURPOSE

Turn the plan into buildable backend/frontend components while preserving the repo-wide
Candidate -> MeasuredWorkObject architecture.

## PIPELINE SERVICES

```text
FloorSourceBindingService
  -> FloorPreExtractionService
  -> FloorDetectionModelService
  -> FloorDetectionSchemaValidator
  -> FloorGeometryValidator
  -> FloorTopologyValidator
  -> FloorTargetedVerifier
  -> FloorReconciliationService
  -> FloorPublicationService

FinishLibraryBuilder + FloorFinishEvidenceExtractors
  -> FinishAssignmentResolver
  -> FinishZoneService

ScreedResolver / WaterproofingResolver / OtherFloorWorkResolver
PerimeterEdgeService + OpeningSpanService -> SkirtingResolver

FloorMeasurementService
  -> MeasuredWorkObjectService
  -> DimensionProjection
  -> WorkbookProjection
  -> Review/BOQ
```

## MODEL CALLS

Recommended production split:

1. **Floor geometry call** — one plan crop + pre-extracted coordinate context. Returns spaces and
   all special/non-floor regions.
2. **Targeted geometry verifier** — only failed/suspicious crops.
3. **Schedule/legend/specification extraction calls** — run once per relevant source, not per room.
4. **Finish ambiguity verifier** — only where deterministic evidence resolution cannot decide.

Do not send the whole drawing package to one model call.

## DETERMINISTIC COMPONENTS

Keep these in code:

- PDF/image transforms;
- schema validation;
- polygon validity/intersection/containment;
- world coordinate conversion;
- area/perimeter/length;
- adjacency/topology checks;
- evidence precedence/scope resolution;
- NRM measurement/deduction logic;
- quantity aggregation;
- cache/invalidation;
- confirmation protection.

## FAILURE BEHAVIOR

Every stage returns structured status: `accepted`, `needs_review`, `blocked`, or `failed`. A failed
AI call must not corrupt canonical geometry. Partial successful results may be saved as Candidates
and shown with review state.


## Application file structure

A simple final structure could be:

```text
backend/app/floors/
  domain/
    models.py
    enums.py
    schemas.py

  source/
    binding_service.py
    pre_extraction_service.py
    pdf_text_extractor.py
    vector_extractor.py
    colour_extractor.py
    hatch_extractor.py
    context_builder.py

  detection/
    provider.py
    prompt.py
    response_schema.py
    schema_validator.py
    geometry_validator.py
    topology_validator.py
    coverage_verifier.py
    targeted_verifier.py
    room_normalizer.py
    reconciliation_service.py

  finishes/
    library_builder.py
    schedule_extractor.py
    room_schedule_extractor.py
    legend_extractor.py
    spec_rule_extractor.py
    tag_detector.py
    colour_matcher.py
    hatch_matcher.py
    assignment_resolver.py
    zone_service.py

  works/
    screed_resolver.py
    waterproofing_resolver.py
    layer_resolver.py
    skirting_resolver.py
    perimeter_edge_service.py
    opening_span_service.py

  measurement/
    geometry_service.py
    quantity_ledger.py
    rule_service.py
    aggregation_service.py

  projection/
    dimension.py
    workbook.py
    three_d.py
    review.py

  jobs.py
  repo.py
  routes.py
  service.py

tests/floors/
  fixtures/
  golden/
```

Frontend can mirror product concepts rather than backend folders:

```text
frontend/features/floor/
  dimension/
  families/
  questions/
  workbook/
  three-d/
  api/
  state/
```

Do not create one giant `floor_service.py` containing detection, finish resolution, measurement and
UI formatting.


## Implementation roadmap

Build in this order so later work rests on proven geometry.

## PHASE 1 — CONTRACTS

1. Freeze Floor vocabulary/object model.
2. Implement source/image/world coordinate contract.
3. Freeze `floor-detection-v3` schema and prompt versioning.
4. Prepare 5-10 reviewed floor-plan golden cases.

## PHASE 2 — PRE-EXTRACTION

5. Render viewport + persist transforms.
6. Extract coordinate text.
7. Add vector geometry/fill extraction where available.
8. Build compact pre-context and caching.

## PHASE 3 — FLOOR DETECTION

9. Main model provider using the model instructions/schema.
10. Strict schema/geometry validator.
11. Topology/coverage verifier.
12. Targeted verifier crops.
13. Reconciliation/user-edit protection.
14. Dimension overlay/editor for FloorSpaces/special/non-floor regions.

**Do not continue until room/floor geometry is good enough on the golden set.**

## PHASE 4 — FINISHES

15. Finish schedule/room schedule/legend/spec extractors.
16. FinishDefinition library.
17. Plan tag + colour + hatch detection.
18. Finish evidence resolver.
19. FinishZone editor/coverage validator.
20. Floor finish MWO + Workbook projection.

## PHASE 5 — FLOOR WORKS

21. Screed resolver + measurement.
22. Waterproofing horizontal/boundary resolver.
23. Other floor layer resolver.
24. Perimeter/opening graph.
25. Skirting resolver + net length ledger.

## PHASE 6 — PRODUCT INTEGRATION

26. Review projection.
27. BOQ rules/descriptions/aggregation.
28. 3D projection using same IDs.
29. dependency-scoped invalidation/events.
30. full-package performance/cost tuning.

## PHASE 7 — ACCEPTANCE

31. Run the acceptance checklist on a varied real dataset.
32. Replace illustrative worked examples with real project traces and arithmetic.
33. Resolve blocking open questions.
34. Only then call Floor ready for the real application.


## Testing and evaluation

## GOLDEN DATASET

Build a reviewed dataset containing real examples of:

- clear vector floor plan;
- raster/scanned plan;
- one and multiple rooms per unit;
- open-plan living/dining/kitchen;
- colour-coded finish plan;
- hatch-coded finish plan;
- tag-only finish plan;
- room finish schedule;
- specification-only room-type rule;
- balcony/terrace/verandah;
- door threshold strips;
- ground-floor under-stair floor;
- upper-floor stair void/open-to-below;
- lift/shaft/void;
- rooms with columns/obstructions;
- multiple finish zones in one room;
- typical floor range + dedicated override;
- conflicting finish sources;
- missing labels/project-specific room codes;
- separate finish plan requiring registration.

## METRICS

Measure separately:

### Geometry

- room/space detection recall;
- polygon IoU / boundary distance;
- missed usable floor surface rate;
- false floor/non-floor rate;
- connector-region recall;
- void/shaft classification accuracy.

### Semantics

- raw label association accuracy;
- normalized room type accuracy;
- finish tag association accuracy;
- finish assignment accuracy;
- conflict detection recall.

### Quantity

- area/perimeter/length error after confirmed scale;
- workbook total difference vs QS benchmark;
- number of user edits/questions per floor.

### Product

- time/cost per floor;
- rerun/caching effectiveness;
- percentage auto-accepted vs reviewed;
- traceability: every quantity has evidence.

## TEST LAYERS

1. unit tests for geometry/rules/resolvers;
2. contract tests for prompts/schemas;
3. golden-image regression tests;
4. package-level end-to-end tests;
5. user correction/reconciliation tests;
6. performance/cost tests.

## PROMPT EVALUATION RULE

Do not improve the prompt because one drawing failed. Add the failed case to the golden dataset,
identify whether the failure is prompt/model, pre-extraction, geometry validation or evidence
resolution, then fix the correct layer.


## Acceptance checklist

Floor is not complete until all of these can be demonstrated.

## FLOOR GEOMETRY

- [ ] Finds all obvious internal room/space floor surfaces.
- [ ] Does not include wall thickness in normal room finish polygons.
- [ ] Finds balconies/terraces/external floor surfaces.
- [ ] Finds door/opening connector floor strips.
- [ ] Correctly handles ground-floor floor below stairs.
- [ ] Correctly marks upper-floor stair/open-to-below voids.
- [ ] Correctly identifies shafts/lift openings/other non-floor regions.
- [ ] Open-plan labels do not create fake walls.
- [ ] Columns/fixtures do not split room geometry incorrectly.
- [ ] Curved/diagonal/irregular rooms remain geometrically faithful.
- [ ] Typical floors are mapped only to stated physical levels.

## ROOM SEMANTICS

- [ ] Raw room label is preserved.
- [ ] Common abbreviations normalize correctly.
- [ ] Project-specific room codes can resolve from schedules.
- [ ] Unknown room type stays unknown instead of being invented.
- [ ] Classification can use symbols/context as well as text.

## FLOOR FINISHES

- [ ] Supports explicit finish codes/tags.
- [ ] Supports colour legends.
- [ ] Supports hatch/pattern legends.
- [ ] Supports room finish schedules.
- [ ] Supports finish schedules.
- [ ] Supports direct material notes/keynotes.
- [ ] Supports specification room-type rules and explicit defaults.
- [ ] Supports multiple finish zones inside one room.
- [ ] Finish conflicts create questions instead of silent overrides.
- [ ] Every assignment shows why it was made.

## FLOOR WORKS

- [ ] Screed is not assumed when not specified.
- [ ] Screed can reuse or differ from finish geometry.
- [ ] Waterproofing uses explicit evidence and separate boundary work.
- [ ] Other layers are classified by actual material/function.
- [ ] Skirting length is explainable by included/excluded edges.
- [ ] Door openings affect skirting without changing room polygons.

## MEASUREMENT / SCALE

- [ ] Source pixel coordinates are preserved.
- [ ] World-mm geometry uses confirmed Pre scale/transform.
- [ ] Canvas zoom/resize does not change quantity.
- [ ] Areas/perimeters/lengths are calculated by code.
- [ ] NRM rules are versioned and deterministic.
- [ ] Gross/deductions/net remain auditable.

## PRODUCT

- [ ] Dimension shows/edit same canonical objects.
- [ ] Workbook rows link back to contributing geometry.
- [ ] 3D uses same object IDs.
- [ ] Review/BOQ do not remeasure quantities.
- [ ] User-confirmed edits survive model reruns.
- [ ] Changed source/scale/rules invalidate only required dependencies.
- [ ] Every unresolved required fact appears as a visible question.

## QUALITY GATE

- [ ] Golden dataset includes vector + raster + several drawing conventions.
- [ ] Real QS benchmark exists for each major edge case.
- [ ] End-to-end Floor totals have passed agreed tolerance.
- [ ] Cost/time per floor is acceptable for production.


## Worked example template

The project planning standard requires a real drawing trace before this section is called fully
done. Use this file when selecting the first real Floor acceptance package.

## SOURCE

- project/file:
- plan sheet/page:
- floor level(s):
- finish plan sheet/page:
- schedule/legend/specification sources:
- confirmed scale:

## DETECTION RESULT

Record:

- spaces detected vs QS truth;
- door connector strips;
- under-stair/special regions;
- balconies/terraces;
- voids/shafts/openings;
- room label/type corrections;
- geometry error/IoU or area difference.

## FINISH RESOLUTION

For each test zone:

```text
zone -> plan evidence -> legend/schedule/spec evidence -> resolved FinishDefinition
```

Include at least one non-tag path such as colour/hatch or room-type specification rule.

## REAL ARITHMETIC

Show code-derived world geometry and quantity:

```text
Finish F__
  gross geometry area      ... m²
  physical holes           ... m²
  NRM rule treatment       ...
  net measured             ... m²

Skirting SK__
  gross perimeter          ... m
  door opening             -... m
  other explicit exclusion -... m
  net measured             ... m
```

## QUESTIONS / FAILURES

List every anomaly/guidance question and how the surveyor resolved it.

## RESULT

State whether the full workflow passed. Any repeated manual correction becomes a golden regression
case, not a one-off prompt patch.
