# Shared Roof System — Implementation and Testing

## Build order

### Phase 1 — Domain foundation

Implement:

- database tables/models
- geometry/value objects
- evidence model
- source/revision links
- roof CRUD/versioning
- scale transforms

No AI dependency required for basic tests.

### Phase 2 — Pre handoff

Implement:

- load Gemini Pre roof inputs
- choose primary roof crop
- attach relevant sections/details/specifications
- preserve source ids/revisions

### Phase 3 — Pre-processing

Implement:

- text + coordinates
- vector helper extraction
- roof-code/pitch/level candidates
- context builder

### Phase 4 — OpenAI geometry detection

Implement:

- versioned model instructions
- strict schema response
- one main request
- response storage
- validation
- normalized Candidate objects

### Phase 5 — Targeted repair and cost controls

Implement:

- automatic failure localization
- repair crop builder
- one repair maximum
- attempt counters
- hard stop/Needs Review
- cache/deduplication
- usage/cost logging per project and roof source

### Phase 6 — Measurement

Implement:

- plan area
- actual pitched-plane area
- curved roof guarded workflow
- edge lengths
- opening geometry
- upstands
- deductions through rule engine

### Phase 7 — Roof systems/build-up

Implement:

- schedule/spec/legend definitions
- evidence resolver
- family assignment
- colour/hatch/code rules
- conflicts

### Phase 8 — Concrete roof/derived materials

Implement:

- slab thickness
- concrete volume
- reinforcement evidence/factor
- soffit/edge formwork
- other editable per-area factors
- clear measured vs derived status

### Phase 9 — UI production wiring

Keep Demo UI layout and replace demo state with production APIs.

Implement:

- real viewports
- roof overlays
- edit/save
- family editing
- upstand edge selection
- opening editing
- structural/derived fields
- layers

### Phase 10 — Workbook/3D/Review/BOQ

Wire deterministic measured work objects into all downstream modules.

---

## API cost controls

Hard requirements:

- `MAX_ROOF_AI_ATTEMPTS = 2`
- attempt 1 full analysis
- attempt 2 targeted repair only
- no automatic third call
- no rerun on page open
- no rerun on ordinary user edit
- dedupe concurrent identical requests
- cache accepted analysis
- log input image count/size, tokens if available, cost estimate and latency

A low confidence alone is not a retry trigger. Retry only when a defined validator can describe what failed and a targeted repair has a good chance of fixing it.

---

## Model quality tests

Create a golden set covering:

1. simple flat RCC roof
2. flat roof with parapets/upstands/outlets
3. simple gable roof
4. hip roof
5. intersecting gable/hip roof
6. mono-pitch roof
7. mixed flat + pitched roof
8. roof terrace over occupied space
9. lower roof/roof below shown on another plan
10. canopy/porch roof
11. different roof levels
12. different roof materials on one plan
13. rooflights/openings
14. curved roof
15. green/glazed roof
16. plan with misleading balconies/terraces/courtyards
17. incomplete pitch requiring section evidence
18. conflicting plan/section pitch

## Geometry metrics

Measure at least:

- roof-region coverage/recall
- false positive roof area
- polygon IoU or boundary tolerance
- plane count correctness
- ridge/hip/valley classification precision
- opening recall
- invalid polygon rate

## Quantity metrics

Compare to QS/manual truth:

- plan area
- actual roof area
- edge lengths
- waterproofing/upstands
- concrete volume
- formwork
- reinforcement when direct data exists

Factor-derived quantities are not model-accuracy metrics because they depend on user/project factors.

## Cost metrics

Track:

- average OpenAI calls per roof source
- percentage needing repair
- average image/token cost
- cache hit rate
- percentage sent to human review after attempt 2

Target behaviour should be close to one geometry call for normal roofs.

## Failure tests

Test that the system does NOT:

- loop AI calls
- treat every terrace as roof
- treat parapet walls as roof planes
- invent pitch
- duplicate overlapping planes
- change scale when canvas zooms
- convert a derived factor into a falsely measured quantity
- double-count concrete roof slab and roof covering in the same NRM2 item

## Acceptance checklist

Before production release:

- [ ] Demo UI layout remains intact
- [ ] Pre/Gemini handoff works with real source ids
- [ ] strict Roof JSON schema is enforced
- [ ] all major roof types are representable
- [ ] exclusions/negative cases are enforced
- [ ] pitch/section evidence is traceable
- [ ] one + one retry limit is enforced
- [ ] cache prevents repeated calls
- [ ] user edits do not call AI
- [ ] actual pitched surface area is deterministic
- [ ] roof systems resolve from multiple evidence styles
- [ ] concrete/reinforcement/formwork supported
- [ ] derived factors clearly labelled and editable
- [ ] NRM2 mapper is tested
- [ ] Dimension/Workbook/3D/Review/BOQ stay synchronized
- [ ] golden test set accepted by a QS

## Falsification questions

The plan should be reconsidered if real projects show that:

- one roof image/crop rarely contains enough context even after Pre handoff
- plan-to-section mapping cannot reliably identify the correct roof
- plane detection remains unstable across common roof drawing styles
- targeted repair costs more than an alternative deterministic workflow
- factor-derived structural quantities are mistaken by users for measured quantities despite UI labels

Do not hide these failures. Use test results to change the architecture.
