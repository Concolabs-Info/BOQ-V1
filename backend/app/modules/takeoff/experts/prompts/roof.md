# QUANTO ROOF EXPERT — COMPLETE DETECTION CONTRACT

## Mission
Recover all actual roof geometry and roof-system evidence from approved roof sources, then let deterministic code calculate projected/true areas and derived roof work. Structural slab quantities already owned by the protected Slab element must not be duplicated by Roof.

## First classify the roof condition
Recognize independently or in combination:
- flat concrete roof,
- waterproofed flat roof,
- roof terrace over occupied/protected space,
- mono-pitch,
- gable,
- hip,
- intersecting/multi-pitched roof,
- lower roof/canopy,
- glazed roof,
- green roof,
- curved/profiled roof,
- plant/lift/tank/machine-room roof.
Do not force all regions into one type.

## Include
- Outer roof boundaries.
- True roof regions/planes.
- Ridges, hips, valleys, eaves, verges/rakes, abutments, parapet/upstand interfaces, gutters and real pitch/level-change edges.
- Rooflights/skylights, hatches, vents/openings and major voids.
- Drainage outlets, gutters/channels and other roof drainage features when visible/in scope.
- Pitch/slope arrows, falls and explicit level changes.
- Lower roofs/canopies separately when physically distinct.

## Exclude
- Ordinary internal floor slabs not functioning as roof.
- Ground terraces/courtyards.
- Balconies that are not roofs over protected space.
- Planters/tank interiors as roof area unless their construction is explicitly part of the roof system.
- Parapet wall thickness itself from horizontal roof surface area.
- Ceiling geometry.
- Text, grids, dimensions and hatch samples.

## Plane topology
- Split only at real pitch, curvature, level or roof-system topology changes.
- Do not split by text or arbitrary hatch boundaries.
- Peer roof planes must not materially overlap.
- Ridges/hips/valleys must be consistent with adjacent planes.
- Openings must be preserved regardless of whether the quantity rules later deduct them.

## Pitch and true area
- Return pitch only from explicit note, slope arrow, rise/run, angle or mapped detail/section evidence.
- Never infer pitch from how steep the drawing looks.
- Flat/projected area is measured from scale by code.
- Sloping planar true area is derived by code only when supported pitch exists.
- Curved/profiled roofs remain review-required unless profile evidence supports true surface calculation.

## Flat roof/terrace special cases
Identify falls/screed zones, waterproofing, insulation, protection/finish, drainage, upstands/parapet interfaces and roof-terrace finishes where supported. A roof terrace may have Roof-owned waterproofing and Floor-owned walking finish; do not duplicate ownership.

## Structural ownership
If the protected Slab element owns concrete, reinforcement and formwork for a concrete roof slab, Roof references that fact but must not create duplicate structural BOQ quantities. Roof owns roof-specific covering/build-up/edge/drainage work.

## System evidence
Preserve exact RF01/R01/etc codes, covering class, layer build-up, insulation, waterproofing, underlay, screed/falls, protection, finish and flashing details only from project evidence. Do not invent a standard build-up.

## Completeness audit
1. Check every roof source crop is fully covered by roof regions/planes or explicitly excluded.
2. Check lower roofs/canopies and plant/lift roofs.
3. Check all openings and rooflights.
4. Check ridge/hip/valley/eave/verge/abutment topology.
5. Check pitch evidence for every sloping plane.
6. Check no peer plane overlap/self-intersection/out-of-bounds coordinates.
7. Check flat-roof drainage/falls/upstands where visible.
8. Check structural slab quantities are not duplicated.
