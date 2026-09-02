# Shared Ceiling System — Implementation and Testing

This file gives the practical build order and what must be proven before Ceiling is production-ready.

## Phase 0 — Pre section-evidence contract

Before special Ceiling features are considered complete, define the contract with Pre.

Pre should be able to provide:

1. section ID/name;
2. source page and section-view bbox/crop;
3. floor/level references;
4. reusable observations for ceiling/soffit levels, slopes/rakes/vaults, bulkheads/drops, double-height/open-to-below and stair soffits where visible;
5. dimensions/notes/detail references and confidence.

Ceiling must be able to read these observations, map them to FloorSpace/CeilingZone objects and request a targeted section re-analysis only when necessary.

This is a shared Pre-to-element contract and should also be reusable by Walls, Roof, Stairs and other elements.

---

## Phase 1 — Basic no-RCP ceiling path

Build first because it covers many real projects and reuses Floor data.

Implement:

1. read confirmed FloorLevel/FloorSpace;
2. create default CeilingZone per valid room/space;
3. exclude known no-ceiling/open-to-sky spaces;
4. build a small finish library from schedule/specification;
5. resolve finish by room/code/rule;
6. calculate flat area deterministically;
7. show/edit on canvas;
8. project to Dimension/Workbook/Review/BOQ.

Success means Quanto can produce a reliable basic ceiling finish takeoff without an RCP.

## Phase 2 — RCP path

Implement:

- RCP source binding;
- PDF text/vector/fill pre-extraction;
- RCP-to-floor alignment;
- ceiling-zone model instructions/schema;
- geometry validation;
- room linking;
- split/merge editing;
- RCP finish code/colour/hatch evidence.

## Phase 3 — Finish evidence system

Support:

- ceiling schedule;
- room finish schedule;
- combined finish schedule;
- legend colour/hatch;
- specification/general notes;
- room-type rules;
- conflicts and exceptions;
- revision-aware finish library.

## Phase 4 — Special ceilings

Add in order:

1. different flat ceiling levels;
2. dropped/partial ceilings;
3. sloped/raked ceilings;
4. vaulted/multi-plane ceilings;
5. double-height;
6. stair soffits;
7. external soffits;
8. curved/manual-enhanced cases.

## Phase 5 — Bulkheads and perimeter works

Implement face/edge geometry and rule-based measurement.

## Phase 6 — Full integration and optimization

Add:

- 3D meshes;
- caching;
- targeted re-analysis;
- typical-floor instancing;
- change propagation;
- evaluation dashboard;
- performance/cost controls.

---

## Suggested backend flow

```text
POST analyse-ceiling(level_id)
    ↓
load source binding + FloorSpaces
    ↓
if no RCP:
    create default zone candidates
else:
    preprocess RCP
    run geometry model
    validate/alignment/reconcile
    ↓
load/map reusable Pre section observations
    ↓
resolve special conditions
    ↓
run targeted section analysis only for missing/ambiguous evidence
    ↓
build/refresh finish library
    ↓
resolve finish assignments
    ↓
calculate deterministic measurements
    ↓
persist candidates/questions
    ↓
return canvas/review projection
```

After user confirmation:

```text
confirm revision
    ↓
create/update MeasuredWorkObjects
    ↓
project to Dimension / Workbook / 3D / Review / BOQ
```

---

## Jobs and caching

Cache by source revision + viewport hash + prompt/schema version + relevant room revision IDs.

Do not rerun the full model when only a finish schedule changes.

Separate invalidation:

- geometry source changed → rerun geometry;
- room geometry changed → reconcile linked/default zones;
- finish schedule changed → rerun finish resolution only;
- specification changed → rerun affected rules only;
- user edit changed slope → recalculate measurement only.

---

## Golden test dataset

Create real drawing packages covering at least:

1. floor plan only, no ceiling drawing;
2. floor plan + room finish schedule;
3. floor plan + specification only;
4. simple RCP with ceiling codes;
5. colour-coded RCP + legend;
6. hatch-coded RCP;
7. one room with two ceiling types;
8. open-plan area with one continuous ceiling;
9. open-to-sky courtyard;
10. double-height lobby;
11. stair void + landing soffit;
12. single-slope/raked ceiling;
13. vaulted ceiling;
14. dropped/stepped ceiling;
15. ceiling island;
16. exposed slab soffit;
17. external balcony/canopy soffit;
18. conflicting RCP and room schedule;
19. missing finish-code definition;
20. typical RCP applied to several floors;
21. scanned/raster RCP;
22. vector RCP with rich text/linework;
23. section crop already analysed by Pre with a sloped ceiling;
24. section crop already analysed by Pre with a bulkhead/drop;
25. Pre section observation that maps to the wrong/ambiguous room and must be reviewed;
26. special ceiling where Pre evidence is incomplete and targeted section analysis is required.

---

## What to compare against

For each golden package, have a QS record:

- expected ceiling zones;
- expected no-ceiling areas;
- expected finish assignments;
- expected special geometry;
- expected measured quantities;
- expected questions/conflicts.

Compare the system to this reference.

---

## Metrics

Track separately:

### Geometry

- zone detection precision/recall;
- room-link accuracy;
- polygon overlap/IoU against reference;
- missed special conditions;
- false no-ceiling areas.

### Finish resolution

- code extraction accuracy;
- definition extraction accuracy;
- room/zone finish assignment accuracy;
- conflict detection accuracy.

### Measurement

- flat area error;
- sloped surface area error;
- bulkhead/soffit error;
- aggregation error.

### Product

- percentage auto-confirmable;
- number of questions per floor;
- user edit rate;
- analysis time;
- model cost per sheet/level.

---

## Acceptance checks

Before Ceiling is called ready:

### Normal path

- no-RCP projects reuse room geometry without unnecessary redetection;
- walls are not accidentally counted as ceiling finish area because geometry comes from room/ceiling zones;
- finish rules can come from schedules/specs/colours/codes.

### RCP path

- RCP aligns to correct level;
- zones split correctly when finish/height changes;
- lights/grids are not mistaken for boundaries;
- room mapping is traceable.

### Edge cases

- open-to-sky does not receive a ceiling quantity;
- double-height is not counted twice;
- stair void/soffit is handled correctly;
- external soffit requires actual overhead surface;
- exposed soffit can still receive a finish;
- sloped/vaulted ceilings use actual surface area;
- stored Pre section evidence is reused before making a new section-model call;
- special section observations are mapped to the correct level/room/ceiling zone;
- incomplete/ambiguous section evidence triggers targeted analysis or review instead of guessing.

### Technical

- schemas validate;
- source coordinate dimensions are preserved;
- canvas zoom does not alter quantity;
- user edits create revisions;
- recalculation is deterministic;
- conflicts are visible;
- every quantity has provenance.

### Integration

- Dimension updates;
- Workbook updates;
- 3D updates;
- Review updates;
- BOQ updates;
- downstream changes occur after edits without duplicate quantities.

---

## Falsification checks

The plan needs revision if real projects repeatedly show any of these:

- room geometry is not a useful default when no RCP exists;
- RCP alignment cannot reliably connect to FloorSpace geometry;
- finish evidence needs a fundamentally different data model rather than new source adapters;
- special ceiling geometry cannot be represented by the proposed plane/face model;
- user edits cannot propagate without manually patching each downstream screen.

If a failure is only a new drawing convention, add a source adapter/evidence rule rather than changing the whole flow.
