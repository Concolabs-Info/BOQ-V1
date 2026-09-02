# Roof — Production Master Plan

## 1. Purpose

This document defines how Quanto should build the Roof element for production.

The existing Demo UI is the visual contract. Keep its layout, navigation, Dimension/Workbook/3D views, left Viewports/Families pane, centre drawing canvas, and right Takeoff/Item pane. The production work is mainly backend logic, real data, validation, editable roof objects, and BOQ integration.

The main rule is simple:

> Pre finds the roof evidence. OpenAI understands the roof. Code measures it. The user can correct it. Confirmed quantities go to the correct BOQ work section.

Do not make Roof a single prompt that calculates final BOQ quantities. Separate understanding from measurement.

---

## 2. What the Roof element must achieve

For every physical roof in the project, Quanto must be able to:

1. Find the correct roof-related drawings already prepared by Pre.
2. Detect all physical roof regions and roof planes.
3. Distinguish flat, pitched and unusual roofs.
4. Read supported pitch, slope, level, material and roof-code evidence.
5. Detect roof edges such as ridge, hip, valley, eave, verge and abutment when they are present.
6. Detect openings such as rooflights, hatches, shafts and large penetrations.
7. Detect waterproofing upstand edges and other roof boundary conditions where supported.
8. Resolve roof coverings and roof build-ups from plans, schedules, legends, specifications and details.
9. Calculate real quantities with deterministic code.
10. Support concrete roof slabs and user-editable derived structural quantities where direct structural detail is not available.
11. Let the user edit all important geometry and properties.
12. Update Dimension, Workbook, 3D, Review and BOQ after every accepted edit.
13. Keep full source/evidence traceability.
14. Control OpenAI cost with one normal call and at most one targeted repair call.

---

## 3. Main production workflow

```text
Project PDF(s)
    ↓
PRE — Gemini
    - classify pages/drawing regions
    - find roof plans, roof terraces, sections, elevations and details
    - crop/store relevant viewports
    - extract useful titles/text/evidence
    ↓
Roof input resolver
    - choose the primary roof plan/crop
    - attach only relevant saved evidence
    - use section evidence only when needed
    ↓
Cheap pre-processing
    - PDF text + coordinates
    - vectors/lines where useful
    - colours/hatches where useful
    - scale/level/pitch notes
    ↓
OpenAI Roof Detection — attempt 1
    - one comprehensive geometry request
    - strict JSON
    ↓
Deterministic validation
    ↓
Valid? ── yes ──→ save roof objects
  │
  no
  ↓
Targeted repair — attempt 2 maximum
    - send only failed/unclear crop or region
    ↓
Still invalid? → Needs Review; stop automatic AI calls
    ↓
Canvas / user correction
    ↓
Measurement engine
    ↓
Evidence/build-up resolver
    ↓
Dimension → Workbook → 3D → Review → BOQ
```

---

## 4. Pre → Roof handoff

Pre already uses Gemini. Roof must reuse that work instead of analysing the whole package again.

Pre should provide, where available:

- primary roof plan crop(s)
- roof terrace/deck crop(s)
- lower roof/canopy crop(s)
- relevant section crop(s)
- relevant elevation crop(s)
- relevant roof detail crop(s)
- relevant schedule/specification/legend crop(s)
- page number and drawing title
- crop bounding box in source page coordinates
- stored image dimensions
- floor/level/scope information
- extracted text and text coordinates
- scale evidence
- section identifiers and section evidence
- roof-related notes/pitch/level evidence already found
- source revision

Roof must not scan unrelated sheets with OpenAI.

### Flat roof rule

If the primary roof plan clearly proves a flat roof and contains enough information, do not send elevations or sections just because they exist.

Use section/elevation evidence only for missing or vertical facts such as:

- different roof levels
- roof steps
- parapet/upstand height
- unclear falls
- sloped/curved geometry
- concrete slab profile
- hidden build-up information

---

## 5. What counts as a roof

Include physical roof surfaces such as:

- flat roofs
- waterproofed concrete roofs
- pitched roofs
- mono-pitch/lean-to roofs
- gable roofs
- hip and pyramid-hip roofs
- intersecting roofs
- butterfly roofs
- mansard/gambrel/saltbox/sawtooth roofs
- curved/barrel/dome/conical roofs when clearly shown
- glazed roof surfaces
- green roof systems
- lower roofs
- porch/entrance roofs
- garage roofs
- independent canopies
- lift/machine/plant/tank roofs
- roof terraces/decks where the slab is acting as a roof to space below

### Do not automatically count these as roof surfaces

- ordinary internal floor slab
- ordinary balcony floor
- ground terrace/paving
- courtyard/open-to-sky area
- void
- parapet wall itself
- railing
- planter/flower trough itself
- tank/equipment itself
- ceiling
- room
- dimensions, grids, text, section arrows or hatches alone

A balcony or terrace may be part of Roof only when evidence shows it is a waterproofed roof/deck over enclosed or protected space, or the project explicitly treats it as a roof system. Its walking finish may still belong to Floor. Avoid double counting.

---

## 6. Main geometry objects

### RoofRegion
A physically separate roof or roof level.

Examples:
- Main pitched roof
- Lower porch roof
- Flat tank roof

### RoofPlane
One measurable surface inside a RoofRegion.

Examples:
- left gable plane
- right gable plane
- one hip plane
- one flat drainage/falls zone

### RoofEdge
A meaningful boundary or junction.

Examples:
- ridge
- hip
- valley
- eave
- verge/rake
- abutment
- parapet
- step/level change
- gutter/channel

### RoofOpening
A real opening through or within the roof surface.

Examples:
- skylight/rooflight
- hatch
- smoke vent
- courtyard void
- shaft/plant opening
- large duct/pipe penetration where measurable

---

## 7. Roof covering and build-up

Each roof zone can be linked to a reusable RoofSystem/BuildUp.

Typical area-based items include:

- tile/slate/sheet covering
- waterproofing membrane
- underlay
- insulation
- screed/falls layer
- protection layer
- other specified roof finish/build-up layers

The system must support finish/build-up evidence from:

- roof codes such as R01/RF02
- direct plan notes
- colours
- hatches
- roof schedules
- material schedules
- specifications
- legends
- general notes
- details

Do not hard-code one schedule layout. Resolve concepts and evidence.

---

## 8. Concrete roof slab and hidden materials

The user wants Roof to support concrete roof quantities as well as coverings.

For a concrete roof slab, the Roof page may show and derive:

- concrete volume
- reinforcement
- soffit formwork
- edge formwork
- waterproofing
- insulation
- screed/falls
- protection/finish layers

There are two levels of certainty:

### Direct / evidenced quantity
Use actual structural drawings, slab thickness, reinforcement schedules/details, or other strong evidence.

### Derived factor quantity
When hidden reinforcement/framing cannot be directly seen, allow an editable project factor such as:

- reinforcement: kg per m²
- timber/steel support: m, kg or nr per m²
- battens: m per m²
- concrete: m³ per m² when thickness is a user/evidence input
- formwork: m² per m² when appropriate

Derived factors must be clearly labelled as **Derived/Assumed**, must retain the factor and source, and should require user confirmation before BOQ acceptance.

Do not pretend factor-derived quantities were detected from the drawing.

---

## 9. NRM2 routing

The geometry object is independent from the measurement standard. NRM2 is the first ruleset.

Main work sections used by Roof-related quantities include:

- **11 — In-situ concrete works**: concrete, reinforcement and formwork for in-situ concrete roof slabs
- **15 — Structural metalwork**: structural steel roof members where in scope
- **16 — Carpentry**: timber roof framing/components where in scope
- **17 — Sheet roof coverings**
- **18 — Tile and slate roof and wall coverings**
- **19 — Waterproofing**
- **23 — Windows, screens and lights**: rooflights/skylights where applicable
- **28 — Floor, wall, ceiling and roof finishings**: only when a specified roof finishing belongs here rather than another roof work section
- **31 — Insulation, fire stopping and fire protection**
- **33 — Drainage above ground**: gutters/outlets/downpipes where included

The roof detector should not decide the final NRM2 line. The rule engine maps confirmed physical objects to the correct work section.

Keep measured BOQ quantities separate from material-order/waste factors.

---

## 10. UI rule — keep the Demo UI

Do not redesign the Roof workspace.

Keep:

- Roof → Dimension
- Roof → Workbook
- Roof → 3D
- left Viewports/Families pane
- centre canvas
- right Takeoff/Item pane
- Draw Add / Remove
- Layers
- editable families

Extend the data shown inside the existing panels only where needed.

### Dimension can show

- roof region/plane polygons
- type/family mark
- actual area and plan area
- pitch/falls
- edges
- openings/deducts
- upstand selected edges
- source/evidence
- structural/derived quantities for the selected roof when enabled

### Workbook can group

- Coverings
- Waterproofing/build-up
- Upstands/edge work
- Openings/accessories
- Concrete roof slab quantities
- Derived structural/material quantities

The BOQ mapper still routes each row to its correct NRM2 section.

---

## 11. User editability

The user must be able to change:

- roof boundary
- plane boundary
- flat/pitched/curved type
- pitch
- slope direction
- level
- material/roof code
- build-up
- ridge/hip/valley/eave/verge classification
- openings
- upstand edges and height
- slab thickness
- derived material factors
- evidence mapping

A user edit does not automatically call AI again.

Edit → validate → recalculate → update all downstream views.

---

## 12. AI cost and retry policy

Default policy:

- one primary OpenAI request per primary roof drawing/crop
- maximum one targeted repair request for failed geometry
- maximum automatic attempts per roof source/region = 2
- after attempt 2, mark Needs Review
- never loop automatically on low confidence alone
- cache successful results
- do not rerun when user opens the page again
- do not rerun after ordinary user edits

Cache key should include at least:

- source asset hash
- crop coordinates/hash
- model configuration
- prompt version
- structured context hash

---

## 13. Definition of done

Roof is production-ready only when:

- all relevant roof surfaces can be represented
- non-roof surfaces are not silently included
- flat and pitched roofs are both supported
- complex roofs can be split into measurable planes
- pitch and material are never invented
- actual surface area is calculated by code
- roof build-up evidence is traceable
- concrete/reinforcement/formwork are supported with clear evidence/derived status
- NRM2 routing is deterministic
- all important properties are editable
- one normal call + one repair maximum is enforced
- cached results prevent repeated API spend
- Dimension/Workbook/3D/Review/BOQ remain synchronized
- golden drawing tests match an experienced QS within agreed tolerances
