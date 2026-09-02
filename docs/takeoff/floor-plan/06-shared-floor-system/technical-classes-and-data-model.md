# Shared Floor System — Technical Classes and Data Model

This file defines the stable technical objects behind the UI. It separates source evidence, candidates, confirmed measured work, finish definitions and downstream quantities so edits can be traced and recalculated safely.


## Core object model

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


## Technical classes

Names are language-agnostic. Adapt to the final Python/TypeScript repository conventions.

## DOMAIN MODELS

- `FloorLevel`
- `FloorPlanViewport`
- `FloorSourceBinding`
- `FloorSurfaceEnvelope`
- `FloorSpace`
- `FloorSpaceRevision`
- `FunctionalZone`
- `ConnectorFloorRegion`
- `SpecialFloorRegion`
- `NonFloorRegion`
- `FloorObstruction`
- `OpeningSpan`
- `PerimeterEdge`
- `FinishDefinition`
- `FinishZone`
- `FloorWorkDefinition`
- `FloorWorkCoverage`
- `EvidenceRef`
- `FloorQuestion`
- repo-wide `Candidate`
- repo-wide `MeasuredWorkObject`

## PRE-EXTRACTION

- `FloorViewportRenderer`
- `FloorPdfTextExtractor`
- `FloorTextCandidateClassifier`
- `FloorVectorGeometryExtractor`
- `FloorColourRegionExtractor`
- `FloorHatchSignatureExtractor`
- `FloorPreContextBuilder`

## FLOOR DETECTION

- `FloorDetectionModelService`
- `FloorDetectionSchemaValidator`
- `FloorGeometryValidator`
- `FloorTopologyValidator`
- `FloorCoverageVerifier`
- `FloorLabelAssociationService`
- `RoomNormalizationService`
- `FloorTargetedVerifier`
- `FloorReconciliationService`
- `FloorTypicalLevelInstantiationService`

## FINISHES

- `FinishLibraryBuilder`
- `FinishScheduleExtractor`
- `RoomFinishScheduleExtractor`
- `FinishLegendExtractor`
- `SpecificationRuleExtractor`
- `FinishTagDetector`
- `FinishColourMatcher`
- `FinishHatchMatcher`
- `FinishZoneService`
- `FinishEvidenceResolver`

## OTHER FLOOR WORKS

- `ScreedResolver`
- `WaterproofingResolver`
- `FloorLayerResolver`
- `FloorWorkCoverageService`
- `PerimeterEdgeService`
- `OpeningSpanService`
- `SkirtingResolver`
- `WaterproofBoundaryResolver`

## MEASUREMENT / PRODUCT

- `FloorGeometryMeasurementService`
- `FloorQuantityLedgerService`
- `NrmFloorRuleService`
- `FloorAggregationService`
- `FloorDescriptionService`
- `FloorDimensionProjectionService`
- `FloorWorkbookProjectionService`
- `Floor3DProjectionService`
- `FloorReviewProjectionService`

## CROSS-CUTTING

- `FloorEvidenceService`
- `FloorQuestionService`
- `FloorConfirmationService`
- `FloorInvalidationService`
- `FloorHistoryService`
- `FloorEvaluationService`


## Database, API and jobs

## DATABASE TABLE/ENTITY GROUPS

Exact names can follow project conventions, but the schema needs these responsibilities:

### Source/evidence

- floor_source_bindings
- floor_pre_extractions
- evidence_refs
- source_registrations

### Geometry

- floor_spaces
- floor_space_revisions
- floor_connector_regions
- floor_special_regions
- floor_non_floor_regions
- floor_obstructions
- opening_spans
- perimeter_edges

### Finish/work libraries

- finish_definitions
- finish_zones
- floor_work_definitions
- floor_work_coverages

### Workflow

- floor_candidates
- floor_questions
- confirmations
- measurement_ledgers / MWO relations
- extraction/job history

## API CAPABILITIES

At minimum:

- start/restart Floor detection for a viewport;
- get detection status/partial candidates;
- get/edit/confirm FloorSpace geometry;
- get/create/update finish definitions;
- assign/change finish zone;
- get/edit floor-work coverage;
- get/edit skirting edge inclusion;
- answer Floor questions;
- fetch Dimension projection;
- fetch Workbook projection;
- fetch Floor 3D data;
- fetch history/evidence.

## BACKGROUND JOBS

Suggested jobs:

```text
floor.pre_extract
floor.detect
floor.verify_regions
floor.reconcile
floor.finish.extract_sources
floor.finish.resolve
floor.works.resolve
floor.measure
floor.project
```

Use deterministic job keys, leases/retries and partial result storage. Do not rerun successful
unchanged stages after a downstream failure.

## EVENTS

Useful domain events:

- `FloorSpacePublished`
- `FloorSpaceUpdated`
- `FinishDefinitionUpdated`
- `FinishZoneUpdated`
- `FloorWorkCoverageUpdated`
- `OpeningSpanUpdated`
- `ScaleChanged`
- `SourceRevisionChanged`

Subscribers recalculate only dependent objects.
