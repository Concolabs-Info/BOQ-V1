# Floor Detection — Overview and QS Procedure

This file defines what counts as a floor surface and how a QS would identify and check the spaces before measurement. Room/space geometry is the main base for floor finishes, with explicit handling for surfaces that room polygons normally miss.


## Scope

This folder decides how Quanto finds the physical floor surfaces that all later Floor work uses.

Reading order:

1. `01-research-notes.md`
2. `02-sop-floor-detection.md`
3. `03-machine-strategy.md`
4. `04-validation-and-edge-cases.md`
5. `05-room-normalization.md`
6. production prompt: `../prompts/model-instructions.md`
7. schema: `../schemas/floor-detection-v3.schema.json`

The main measurement base is **room/space surface geometry**, plus explicit special floor
regions such as door thresholds and valid under-stair floor.


## Research notes

This is a compact evidence/behavior catalogue used to design the SOP and machine strategy.

## WHAT A FLOOR PLAN CAN SHOW

A plan may contain:

- enclosed rooms;
- open-plan spaces with several use labels;
- corridors/lobbies/common areas;
- balconies, terraces, verandahs, porches and external landings;
- parking/garage floors;
- stair flights and landings;
- lift cores and shafts;
- voids/open-to-below areas;
- columns/plinths inside rooms;
- door and large opening thresholds;
- floor finish tags, colours, hatches and material notes;
- printed room dimensions/areas;
- typical floor labels and level notes.

## MAIN GEOMETRY OBSERVATION

For floor finish, the useful room surface is normally inside the walls. Therefore room/space
polygons should generally follow the **inner faces of enclosing walls**. This avoids counting
wall thickness as floor finish.

The whole external building/slab outline is useful as a coverage check but is not the direct
finish measurement geometry.

## WHY ROOM POLYGONS STILL MISS AREA

When two rooms meet through a door, each room boundary usually closes at its wall face/threshold.
The floor through the wall opening can fall between the two polygons. That strip must be captured
separately.

Stairs cause the same kind of special case. At ground level there can be finished floor beneath
a stair. At an upper floor the same plan footprint may be an opening/void. The detector needs a
semantic result, not a hardcoded stair subtraction.

## ROOM LABELS ARE NOT UNIVERSAL

Examples for the same type may include:

- `TOI`, `WC`, `W.C.`, `Toilet`, `Restroom`;
- `BATH`, `Bathroom`, `Bath`, `ENS`, `Ensuite`;
- `BED`, `BR`, `Bedroom`, `Master Bed`, `Guest Room`;
- project-specific room codes with meaning supplied only in a schedule.

A robust system combines text, symbols, layout, adjacency and project data. It preserves the raw
label even after normalization.

## THINGS THAT ARE NOT ROOM BOUNDARIES

Unless the drawing clearly says otherwise:

- furniture;
- sanitary fixtures;
- kitchen cabinets;
- dimension lines;
- grids;
- door swing arcs;
- finish hatch boundaries;
- text boxes;
- loose equipment.

## FLOOR VS NON-FLOOR

Do not assume enclosed = floor and external = no floor. A balcony can be a valid floor finish;
a shaft inside the building can be no floor. The correct question is: **does a physical,
measurable surface exist here at this level?**

## OLD IMPLEMENTATION IDEAS WORTH KEEPING

From the prior AutoBOQ work:

- exact source image dimensions in model output;
- strict structured response;
- coordinate-aligned text evidence;
- vector/wall-cell geometry as an independent check;
- label-based recovery of model-missed spaces only when wall geometry supports the space;
- open-plan labels must not create fake physical walls;
- user editing and cached reruns.

## WHAT MUST BE STRONGER IN QUANTO

- explicit connector floor regions for doorway/opening strips;
- explicit special floor regions for under-stair floor and similar cases;
- all external floor surfaces kept and classified;
- complete coverage/topology checking;
- source-pixel + world-mm geometry retained together;
- targeted verifier pass instead of trusting one large model response;
- user-confirmed geometry protected across reruns.


## QS procedure

## PURPOSE

Define what the correct Floor geometry should be before discussing AI or code.

## INPUTS

- confirmed controlling floor-plan viewport;
- confirmed level/typical-floor mapping;
- confirmed scale;
- relevant plan notes/schedules needed to understand space names;
- secondary plans/details only when needed to resolve an ambiguous condition.

## DECISIONS

**D1. Work one controlling plan at a time.**  
Know exactly which physical level(s) it represents.

**D2. First identify all physical floor-surface areas.**  
Look for internal rooms, common circulation, balconies/terraces, landings, parking and other
walkable surfaces. Also identify areas where no floor exists.

**D3. Trace enclosed rooms to the inner faces of walls.**  
Do not include wall thickness in the room polygon.

**D4. Trace external floor spaces to their real walkable boundary.**  
Use wall/parapet/guard/slab-edge evidence as appropriate. Do not force an external area into an
"internal room" rule.

**D5. Keep physical space separate from functional naming.**  
If Living/Dining/Kitchen is one open area with no physical walls, keep one physical FloorSpace.
Store the three uses as functional zones or finish zones when needed.

**D6. Treat door/opening strips explicitly.**  
Close each room logically at its threshold. Record the physical floor strip through wall
thickness as a ConnectorFloorRegion so it is not lost or double-counted.

**D7. Resolve stair conditions by actual surface existence.**  
Ground-floor area under stairs is included when it is an accessible/finished surface. Stair
openings/open-to-below areas at upper levels are NonFloorRegions. Stair treads/risers themselves
are not Floor finish geometry; they belong to Stairs & Ramps.

**D8. Record balconies/terraces as FloorSpaces when a surface exists.**  
Classify environment separately.

**D9. Record voids/openings/shafts separately.**  
Do not immediately decide NRM deduction treatment. Geometry is a fact; commercial deduction is
a later rule.

**D10. Record obstructions separately from the host room.**  
A column does not split the room polygon. Keep a FloorObstruction and let measurement rules decide
whether it affects the measured finish.

**D11. Preserve raw text. Normalize carefully.**  
Keep `TOI` as raw evidence even if normalized to `toilet`. If type is uncertain, return `unknown`
or a broader category, not an invented answer.

**D12. Capture finish evidence but do not assign final finishes here.**  
A visible `F03`, colour, hatch or material note becomes evidence for Floor Finishes.

**D13. Verify completeness visually and topologically.**  
Every obvious physical floor surface should be represented exactly once as a main space or
special/connector region; genuine non-floor areas should be represented as such.

**D14. Calculate after acceptance only.**  
Code uses confirmed scale to calculate area/perimeter. Printed dimensions/areas are cross-checks.

## WORKED EXAMPLE

```text
Ground Floor bathroom
  room polygon                follows inner wall faces
  raw label                   "TOI"
  normalized type             toilet
  plan finish evidence        F05
  door threshold strip        CT-GF-07, outside room polygon
  column inside room          OB-GF-02, kept separately
  model area                  ignored
  official area               calculated later by geometry service

Stair beside lobby
  stair footprint             detected
  floor beneath lower flight  visible/access-controlled -> SpecialFloorRegion
  opening to floor above      not counted on Ground
```

## OPEN

- Exact project tolerances for printed-dimension/area cross-checks are evaluation settings.
- Curved boundaries can be represented as dense polygon vertices in v1; native curve geometry is
  optional later.

## FALSIFICATION

If surveyors repeatedly need to redraw the same kind of valid floor condition after the model +
validator passes it, that condition must enter the golden test set and the rule/strategy must
change.
