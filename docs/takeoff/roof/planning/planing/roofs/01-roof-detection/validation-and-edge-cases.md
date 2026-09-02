# Roof Detection — Validation and Edge Cases

## Core rule

The detector must prefer **uncertain** over a confident guess.

## Positive roof cases

Support at least:

- flat concrete roof
- flat membrane roof
- roof deck/terrace over occupied space
- tile roof
- slate roof
- metal/sheet roof
- shingle roof
- mono-pitch/lean-to
- gable
- hip/pyramid hip
- intersecting roofs
- Dutch gable
- saltbox
- gambrel
- mansard
- butterfly
- sawtooth
- A-frame
- glazed roof
- green roof
- barrel/curved
- dome
- conical
- lower roof
- canopy
- porch/verandah roof
- garage roof
- lift/plant/tank roof

## Negative cases

Do not classify as roof merely because the shape is enclosed or hatched:

- room floor
- normal balcony slab
- normal terrace/paving at ground
- open courtyard
- open-to-sky void
- flower trough/planter
- parapet/guard wall
- railing
- water tank/equipment
- stair
- ceiling
- title block
- detail bubble
- section/elevation marker
- north arrow
- dimensions/grids
- material legend swatch

## Balcony / terrace rule

A balcony or terrace can have both Floor and Roof scope.

Example:

- tile finish walked on top → Floor
- waterproofing layer protecting occupied space below → Roof/Waterproofing

Store separate scope objects and do not double-count the same layer.

## Roof below / lower roofs

A lower roof may be shown on an upper floor plan as `ROOF BELOW`.

Create a roof object if the surface is physically part of the project and measurable. Keep its actual roof level/scope. Do not assign it to the upper floor just because that is where it is drawn.

## Multiple roofs on one sheet

Create separate RoofRegions for disconnected roofs or different levels.

## Mixed flat + pitched roof

Keep separate regions/planes where geometry or roof systems differ.

## Different pitches on one roof

Split at supported pitch-change lines. Do not split based only on hatch direction.

## Intersecting pitched roofs

Use ridges, hips and valleys to build plane topology. Adjacent plane junction coordinates should match exactly after normalization.

## Hidden/obscured geometry

If part of a roof is covered by notes, callouts or another graphic:

- use vector/text evidence where possible
- use surrounding topology
- do not confidently invent hidden corners
- create a review item if the boundary cannot be proved

## Curved roofs

Store curved surface type and plan footprint. Only calculate true curved area when radius/profile evidence exists. Otherwise require user input/review.

## Flat roofs with falls

A nominal flat roof may have falls to outlets.

Do not create many planes unless the drawing actually shows separate drainage/fall planes or level breaks. Small construction falls may be stored as a fall attribute instead.

## Roof steps / different levels

Split when there is a real level change. Use plan level notes and Pre section evidence.

## Dormers

Treat dormer roof surfaces as separate planes/regions linked to the host roof. Detect valleys/abutments around them when shown.

## Canopies

Include only actual canopy roof surfaces. The support columns/walls are not part of Roof geometry.

## Plant/tank/lift structures

A roof over a plant/tank/lift room is a roof. The tank/equipment itself is not.

## Roof openings

Detect clear:

- rooflights/skylights
- lanternlights
- hatches
- smoke vents
- chimneys/large penetrations
- shafts
- open courtyards
- plant openings

Small penetrations may be stored as point evidence when their area cannot be reliably drawn.

## Parapets and upstands

Parapet masonry belongs to Walls, but the waterproofing upstand/capping/abutment treatment can belong to Roof. Store the roof edge and height evidence separately.

## Rainwater drainage

Detect only when clearly shown:

- gutter
- internal/box/valley gutter
- outlet
- hopper
- scupper
- sump
- overflow
- RWP/downpipe

Route final BOQ ownership according to the project/NRM2 rules.

## Conflicting evidence

Examples:

- plan says 25°; section says 30°
- plan roof code R01; specification says R02 for same zone
- level note conflicts with section

Do not silently choose. Create a conflict with both evidence references.

## Validation severity

### Blocker
- invalid polygon
- no host region
- impossible coordinates
- severe overlapping planes
- no scale for measurement

### Review warning
- missing pitch
- unknown material
- uncertain edge type
- minor topology ambiguity

Unknown material/pitch does not prevent geometry from being saved.
