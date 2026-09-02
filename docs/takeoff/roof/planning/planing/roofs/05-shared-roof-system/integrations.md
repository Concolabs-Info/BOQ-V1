# Shared Roof System — Integrations

## 1. Pre integration

Pre/Gemini provides the roof evidence inventory.

Roof must consume stable source ids/crops rather than rediscover pages.

Useful Pre records:

- roof plan
- roof terrace/deck plan
- lower roof/canopy
- section
- elevation
- detail
- roof schedule/specification

## 2. Scale integration

Use the existing project/source scale system.

If a roof crop comes from the same scaled PDF/source as another confirmed crop, reuse the transform when valid.

If a separate image/PDF has no confirmed scale, require scale confirmation before physical measurement.

Canvas display size never changes the measurement scale.

## 3. Demo UI / Dimension integration

Keep the existing shell.

### Left pane

Viewports:

- roof plan/terrace
- upper/lower roof as available
- relevant section/elevation/detail
- used specification/schedule evidence

Families:

- Coverings/Systems
- Upstands
- optionally derived/structural presets without creating a new navigation paradigm

### Centre canvas

Show:

- roof plane/zone fills
- type mark
- live area
- edge overlays
- selected upstand edges
- openings/deducts
- optional ridge/hip/valley overlays

Editing:

- move vertices
- add/delete zone
- split/merge plane
- reclassify roof
- add/remove opening
- edit edge classification

### Right pane

Selected roof Item can show:

- roof type
- system/type
- plan area
- actual surface area
- pitch/falls
- level
- selected upstand edges/height
- openings summary
- source/confidence
- concrete/derived quantities when applicable

## 4. Dimension integration

Dimension stores the geometry-derived physical quantities and calculation basis.

Examples:

- actual covering area
- waterproofing area
- ridge/hip/valley lengths
- upstand length/area
- rooflight count/area
- concrete volume
- formwork area
- reinforcement derived/evidenced mass

## 5. Workbook integration

Recommended tree can expand the Demo concept while keeping the same Workbook UI:

```text
Coverings
Waterproofing / Build-up
Upstands / Edge work
Openings / Accessories
Concrete Roof Slab
Derived Materials
```

Rows group by family/system and roof scope.

Every row links back to source Roof object ids.

## 6. 3D integration

Generate simple roof surfaces using:

- plan polygon
- level
- pitch
- slope direction
- adjacent edges

For complex roofs, planes should meet at shared ridges/hips/valleys.

3D is a review aid, not the measurement authority.

For flat roofs with no explicit fall geometry, show a flat plane unless confirmed fall data is available.

## 7. Review integration

Review should surface:

- low-confidence geometry
- missing pitch
- unknown roof system
- evidence conflicts
- derived structural factors
- failed validation

The user can jump back to the Roof Dimension view.

## 8. BOQ integration

Only confirmed/accepted measured work objects flow to final BOQ.

The BOQ mapper routes each object to the correct NRM2 work section.

Examples:

- metal sheet covering → 17
- tile/slate → 18
- waterproofing → 19
- insulation → 31
- concrete/reinforcement/formwork → 11
- timber framing → 16
- structural steel → 15
- rooflight → 23 when applicable
- drainage → 33 when applicable

## 9. Edit propagation

Example:

```text
User moves roof vertex
→ Roof geometry version increments
→ area/edge lengths recalculate
→ build-up quantities recalculate
→ concrete/formwork/derived factors recalculate
→ Workbook rows become changed/unconfirmed
→ 3D refreshes
→ Review/BOQ use latest confirmed version
```

No AI call is needed for this normal edit.
