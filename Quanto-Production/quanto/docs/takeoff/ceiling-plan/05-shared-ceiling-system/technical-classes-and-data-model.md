# Shared Ceiling System — Technical Classes and Data Model

This file defines the stable technical objects behind the Ceiling UI and measurement flow.

## Main domain objects

### CeilingLevelContext
References the repo-wide `FloorLevel` and its active source bindings.

### CeilingSourceBinding
Connects a level to its RCP/floor plan/sections/schedules/specification sources.

### CeilingZone
One accepted plan extent of a ceiling condition.

Suggested fields:

```text
id
floor_level_id
linked_floor_space_ids[]
geometry_revision_id
geometry_origin
condition
environment
ceiling_level_mm?
status
confidence
```

### CeilingZoneGeometryRevision
Stores versioned plan geometry and source/world transforms.

```text
polygon_px
source_width_px
source_height_px
source_page_id
transform_to_world
polygon_world_mm
created_from
confirmed_by_user
```

### CeilingFinishDefinition
Reusable project finish/system definition.

### CeilingFinishAssignment
Connects one CeilingZone to one CeilingFinishDefinition with evidence and status.

### SpecialCeilingGeometry
Stores special geometry such as:

```text
special_type
low_level_mm?
high_level_mm?
slope_angle?
slope_direction?
ridge_line_world?
planes[]
source_evidence[]
```

### CeilingPlane
A 3D measurable surface used for sloped/vaulted/multi-plane ceilings.

### CeilingExclusionRegion
Open-to-sky, no-ceiling, shaft/opening or other excluded coverage.

### Bulkhead
Contains footprint/edges/drop height and face definitions.

### BulkheadFace
One measurable face: underside/vertical/end.

### SoffitZone
External/exposed underside zone when treated separately from internal ceiling zones.

### CeilingBoundaryEdge
Canonical edge used for trims/cornices/perimeter work.

### CeilingEvidenceRef
Source fact with page/crop coordinates, raw text and revision. It can reference a reusable observation created by Pre.

### PreSectionObservationRef
A lightweight link to section evidence already produced in Pre. It should reference the original Pre observation rather than duplicate its data. Typical observation types include ceiling level, sloped/raked ceiling, bulkhead/drop, double-height/open-to-below and stair soffit.

### CeilingConflict / CeilingQuestion
Unresolved evidence or missing information.

### Candidate
Repo-wide extraction candidate.

### MeasuredWorkObject
Repo-wide confirmed measurable object used by Dimension/Workbook/BOQ.

---

## Relationship summary

```text
FloorLevel
  -> FloorSpace
  -> CeilingSourceBinding
       -> CeilingZone
            -> CeilingZoneGeometryRevision
            -> CeilingFinishAssignment -> CeilingFinishDefinition
            -> SpecialCeilingGeometry -> CeilingPlane
            -> Bulkhead / SoffitZone / CeilingBoundaryEdge

All conclusions -> CeilingEvidenceRef
Validated quantities -> MeasuredWorkObject
```

---

## Suggested services/classes

Names can be adapted to final TypeScript/Python conventions.

### Source/pre-processing

- `CeilingSourceBindingService`
- `CeilingViewportRenderer`
- `CeilingPdfTextExtractor`
- `CeilingVectorExtractor`
- `CeilingColourRegionExtractor`
- `CeilingHatchExtractor`
- `CeilingPreContextBuilder`
- `CeilingDrawingClassifier`
- `PreSectionObservationReader`
- `CeilingSectionEvidenceLinkService`

### Geometry

- `DefaultCeilingFromFloorService`
- `CeilingDetectionModelService`
- `CeilingDetectionSchemaValidator`
- `CeilingAlignmentService`
- `CeilingGeometryValidator`
- `CeilingTopologyValidator`
- `CeilingCoverageVerifier`
- `CeilingRoomLinkService`
- `CeilingReconciliationService`
- `CeilingTargetedVerifier`

### Finish extraction/resolution

- `CeilingFinishLibraryBuilder`
- `CeilingScheduleExtractor`
- `RoomFinishScheduleExtractor`
- `CeilingLegendExtractor`
- `CeilingSpecificationRuleExtractor`
- `CeilingFinishEvidenceResolver`
- `CeilingFinishConflictService`

### Special geometry

- `SpecialCeilingResolver`
- `CeilingPreSectionEvidenceResolver`
- `CeilingTargetedSectionAnalysisService`
- `CeilingSlopeGeometryService`
- `CeilingPlaneBuilder`
- `VaultedCeilingService`
- `DoubleHeightCeilingService`
- `StairSoffitLinkService`

### Bulkheads/soffits

- `BulkheadDetectionService`
- `BulkheadGeometryService`
- `ExternalSoffitResolver`
- `CeilingBoundaryEdgeService`
- `CeilingPerimeterWorkResolver`

### Measurement

- `CeilingMeasurementService`
- `CeilingSurfaceAreaService`
- `CeilingOpeningRuleService`
- `CeilingMeasurementRuleService`
- `CeilingAggregationService`
- `CeilingQuantityLedgerService`

### Product/integration

- `CeilingCanvasProjectionService`
- `CeilingDimensionProjectionService`
- `CeilingWorkbookProjectionService`
- `Ceiling3DProjectionService`
- `CeilingReviewProjectionService`
- `CeilingBoqProjectionService`

### Cross-cutting

- `CeilingEvidenceService`
- `CeilingQuestionService`
- `CeilingConfirmationService`
- `CeilingInvalidationService`
- `CeilingHistoryService`
- `CeilingEvaluationService`

---

## Status model

Useful states:

```text
candidate
validated
needs_review
conflict
user_confirmed
superseded
rejected
```

Do not use one boolean such as `approved` for the whole lifecycle.

## Editing/versioning rule

User edits create a new revision.

Dependent objects carry the revision ID used for their calculation.

When geometry, finish, level or slope changes:

1. mark dependent measured work stale;
2. recalculate;
3. keep previous revision/history;
4. update projections.

## Database responsibility groups

Exact table names can change, but persistent data should cover:

- ceiling source bindings;
- ceiling zones/revisions;
- finish definitions;
- finish assignments;
- special geometry/planes;
- bulkheads/soffits/edges;
- evidence refs;
- conflicts/questions;
- user confirmations;
- measurement ledger/provenance;
- evaluation/test results.
