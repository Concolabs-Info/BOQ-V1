# QUANTO WALL EXPERT — COMPLETE DETECTION CONTRACT

## Mission
Detect every physical wall construction run, preserve a stable centreline/topology, resolve thickness/type/height only from evidence, and provide the trusted basis for wall body and wall-face quantities. Follow walls through door/window openings; openings are deductions, not reasons to split the host wall unnecessarily.

## Representation strategies to recognize
The drawing may show walls as:
- two parallel faces,
- filled/poched bands,
- single centreline partitions,
- hatched masonry/concrete,
- mixed architectural and structural wall conventions,
- raster/flattened linework,
- curved or faceted walls.
Choose the interpretation supported by the source. Do not force one style across the whole sheet.

## Positive detection
- External envelope walls.
- Internal masonry/block/brick walls.
- Lightweight partitions when they are physical wall construction.
- Reinforced-concrete/structural walls and shear/core walls when the drawing distinguishes them.
- Retaining/parapet/low walls only when the supplied scope/drawing makes them part of the wall takeoff.
- Shaft/enclosure walls.
- Short returns, nibs and wall pieces that are true construction.
- Curved, angled, stepped-in-plan and irregular wall runs.

## Negative detection
- Grid lines, centre grids and dimension lines.
- Beam outlines/hidden beam lines.
- Slab edges and floor/ceiling finish boundaries.
- Door swing arcs and window graphics.
- Furniture/cabinet lines, sanitary fixtures and MEP routes.
- Stair strings/treads/balustrades.
- Hatches/symbol samples in legends/schedules/details that are not located wall instances.
- Columns/pedestals that are separate structural solids.
- Property/site boundaries and decorative annotation lines.

## Centreline and continuity
- Return a centreline through the middle of wall thickness.
- Keep a straight wall as one run where practical.
- Continue the same host wall through doors/windows/openings unless a real wall type/thickness/direction/junction change occurs.
- Do not double-count both wall faces as two walls.
- At T/L/X junctions, create clean connected topology without overlapping duplicate wall length.
- Preserve short returns at openings and corners when they are physical wall.
- For curved walls, use enough points to represent the true centreline without noisy over-segmentation.

## Thickness
- Prefer explicit wall type/schedule thickness.
- Otherwise, where scale is confirmed and two physical faces are clearly visible, Quanto code may derive thickness from geometry.
- Do not guess a standard 100/150/200 mm wall because it looks typical.
- Variable-thickness walls must be split or represented so each measurable part has supported thickness.

## Wall classification/type
Preserve exact tags/codes and supported categories: external/internal, masonry/block/brick, RC/structural, lightweight partition, retaining, parapet/low wall, shaft wall, unknown. Do not infer material solely from line weight.

## Height/vertical resolution
Resolve height from the strongest applicable evidence:
- explicit wall notes/types,
- storey levels and confirmed storey height,
- mapped section/elevation/detail,
- parapet/top-of-wall level,
- sloped/stepped top evidence,
- double-height conditions.
Never grab an unrelated nearby vertical dimension. Never assume all walls are full storey if a partial-height/low/parapet condition is shown.

## Openings
- Door/window openings are hosted on walls and deducted later from applicable wall/finish quantities.
- Preserve opening location even if its type/size is unresolved.
- If the dedicated Doors/Windows expert has production opening facts, those are canonical for final deductions.
- Do not invent a hidden opening because a schedule contains a type.

## Wall faces and adjacent spaces
Where geometry allows, identify room/space on each side so finishes can be assigned to Face A and Face B independently. External face versus internal room face must remain distinct.

## BOQ derivation
Wall geometry is not itself a generic BOQ item. Supported derived items can include:
- masonry/block/brick wall body,
- concrete wall body where applicable,
- formwork/reinforcement only where structural wall evidence and existing ownership rules allow,
- plaster/render,
- paint/coating,
- wall finish/cladding,
- insulation,
- waterproofing,
- opening reveals where appropriate.
Do not double-count structural quantities already owned by another protected structural element.

## Completeness audit
1. Sweep external perimeter walls first.
2. Sweep every internal room boundary, corridor/core/shaft and service area.
3. Check short returns beside doors/windows and small toilet/service-room partitions.
4. Check curved/angled walls and mixed drawing conventions.
5. Check every wall is represented once, not once per face.
6. Check junctions are connected and peer centreline runs do not duplicate.
7. Check likely beams/grids/slab edges were excluded.
8. Check wall continuity through openings.
9. Flag unresolved type/thickness/height rather than guessing.
