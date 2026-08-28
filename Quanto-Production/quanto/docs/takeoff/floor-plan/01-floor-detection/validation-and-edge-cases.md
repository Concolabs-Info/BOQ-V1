# Floor Detection — Validation and Edge Cases

This file contains the rules that stop the model or geometry engine from silently producing wrong floor areas. It also defines room-name normalization so different drawing conventions can map to stable internal room types.


## Geometry validation and edge cases

## PURPOSE

Give code and prompts a shared checklist for unusual plans.

## A. HARD GEOMETRY VALIDATION

Reject or review when:

- source image size does not match the input image;
- point is outside source bounds;
- polygon has fewer than 3 unique points;
- polygon is zero/near-zero area;
- polygon self-intersects;
- duplicate IDs exist;
- child references a missing parent;
- peer spaces overlap materially without an allowed relation;
- connector/special region is duplicated inside another measured surface.

## B. TOPOLOGY / COVERAGE VALIDATION

Check:

- room edges mostly align to inner wall faces or valid external floor edges;
- room polygons do not cut through obvious wall mass;
- obvious enclosed/walkable cells are not missing;
- unexplained gaps between adjacent rooms are examined;
- opening/door relationships match boundary breaks;
- non-floor regions are plausible and not simply empty white space;
- balcony/terrace regions are not accidentally thrown away;
- detached blocks on one drawing can form separate surface envelopes;
- crop-edge rooms are marked partial if the source viewport cuts them.

## C. DOOR / OPENING CASES

### Normal hinged/sliding door between rooms

- room A ends at its logical threshold;
- room B ends at its logical threshold;
- wall-depth strip through opening becomes ConnectorFloorRegion;
- door swing arc is ignored as geometry.

### Large opening with no door

Same treatment if there is a wall opening and real floor through it.

### Different finish on each side

Do not guess ownership of the connector. Finish resolver uses threshold detail/tag/project rule;
otherwise ask. It may split the connector at a defined transition line.

### Same finish on both sides

Resolver can assign/merge connector into the same finish family after evidence checks.

## D. STAIRS

### Ground-floor floor below stair

Include if the drawing/context supports a real accessible floor surface. Clues can include a room
or store label below, walls/door enclosing under-stair space, continuation of floor hatch/finish,
or section/detail evidence.

### Upper-floor stair opening

Classify the open well/open-to-below as NonFloorRegion. Landings that are actual horizontal
surfaces remain floor surfaces.

### Stair treads/risers

Do not measure them as Floor. They belong to Stairs & Ramps even if they use the same finish
material.

### Ambiguous stair footprint

Return `uncertain_surface` review item and use section/stair source or user guidance.

## E. BALCONIES / TERRACES / VERANDAHS / PORCHES

Include as FloorSpace if a physical surface exists. Record `environment=external` or
`semi_external`. Parapet/railing is not a room boundary in the same way as an internal wall, but
its inside/slab edge can define the walkable surface.

## F. VOIDS / SHAFTS / OPEN-TO-BELOW

Require evidence such as label, surrounding boundary, stair/lift geometry, hatch convention or
section. Do not treat every blank polygon as a void.

## G. COLUMNS / PLINTHS / EQUIPMENT

Keep the host room. Record material obstructions separately. Later NRM rules decide whether a
small obstruction changes measured area.

## H. OPEN PLAN

Living/Dining/Kitchen text in one physical cell does not create three room polygons. Keep one
FloorSpace + FunctionalZones. Finish zones may still split if the drawing gives a real finish
boundary.

## I. ROOMS WITH MULTIPLE NAMES

Examples: `LIVING / DINING`, `BATH / WC`, bilingual labels. Preserve all raw labels; normalize to
one or more functional tags while keeping one physical space unless a boundary exists.

## J. ROOM LABEL OUTSIDE THE ROOM

Leader/keynote or cramped plan may place text outside. Use leader lines, proximity and boundary
context. Lower semantic confidence if association is unclear.

## K. NO ROOM LABEL

Geometry can still be a FloorSpace with `raw_label=null`, `normalized_type=unknown`. Symbols and
adjacency may suggest a type, but uncertain meaning is not a reason to omit geometry.

## L. CURVED / DIAGONAL / IRREGULAR WALLS

Follow actual inner face. Polygon may use more vertices. Do not orthogonalize a real diagonal or
curve just to make geometry neat.

## M. SPLIT LEVELS / STEPS IN FLOOR

Keep one level reference plus local level/elevation evidence or create sub-level metadata as
needed. If the vertical difference changes floor finish measurement only by plan area, geometry
can stay horizontal; ramps/sloping surfaces need the relevant workstream/rule.

## N. RECESSES / ALCOVES / BAY WINDOWS

Include if usable floor surface continues into them. Furniture does not cancel them.

## O. BUILT-IN CABINETS / KITCHEN UNITS

Do not automatically remove their footprint from room geometry. Finish/skirting coverage is
project-specific and handled later from explicit evidence/rules.

## P. SANITARY FIXTURES

WC, basin, bath and shower symbols help semantic classification. They are not room boundaries.

## Q. MULTIPLE UNITS / APARTMENTS

Store unit relation separately. Common corridor/lobby remains a FloorSpace. Do not merge rooms
with the same name across different units.

## R. TYPICAL FLOORS

Only replicate geometry across exact physical levels stated by the drawing/Pre. A dedicated plan
for one level replaces that instance only.

## S. REVISION / CLOUDS

If revision-clouded regions intersect accepted Floor geometry or finish evidence, mark affected
objects stale/reviewable when a newer revision is loaded.


## Room normalization

## PURPOSE

Make room semantics consistent without depending on one office's abbreviations.

## RULE

Always store both:

```text
raw_label        exactly what is printed
normalized_type  Quanto internal taxonomy
```

Normalization uses all available evidence:

1. printed room label/number;
2. project room schedule/code table;
3. symbols/fixtures;
4. physical layout/context;
5. adjacency/circulation;
6. model reasoning;
7. alias dictionary as a helper.

The dictionary is not the final authority.

## EXAMPLES

| Raw examples | Possible normalized type |
|---|---|
| TOI, WC, W.C., Toilet | toilet |
| Bath, Bathroom | bathroom |
| Ens, Ensuite, En-suite | ensuite |
| Bed, BR, Bedroom, M. Bed | bedroom |
| Kit, Kitchen, Pantry Kitchen | kitchen |
| Liv, Living, Lounge, Sitting | living |
| Din, Dining | dining |
| Liv/Din | living_dining |
| Corr, Corridor, Passage | corridor |
| Lobby, Foyer | lobby |
| Store, St., Storage | store |
| Util, Utility | utility |
| Bal, Balcony | balcony |
| Terr, Terrace | terrace |
| Ver., Verandah, Veranda | verandah |
| Garage, Carport | garage_or_carport, decided by evidence |
| Elec, Electrical | electrical_room |
| Mech, Plant | plant_room |
| Lift Lobby | lift_lobby |
| Stair Lobby | stair_lobby |

## TOILET/BATHROOM EXAMPLE

Do not map `TOI` to `bathroom` only because both are wet areas. If the plan shows WC + basin and
no bath/shower, `toilet` is stronger. If a project schedule says room code `T-03 = Accessible WC`,
that project evidence wins.

## UNKNOWN / PROJECT-SPECIFIC CODES

If the label is `R-17` and a room schedule maps `R-17 -> Laundry`, normalize from the schedule.
If no mapping exists, preserve `R-17`, set normalized type to `unknown`, and ask only if type is
needed downstream.

## WHY NORMALIZATION MATTERS

Room type can help apply **explicit project rules** such as “all bathrooms receive F05”. Room type
itself is not permission to invent a finish, screed or waterproofing system.


## Reference room taxonomy

The taxonomy below is a helper only. The model must still use drawing context, symbols and evidence; it must not classify a room from one abbreviation alone.

```json
{
  "version": "room-taxonomy-v1",
  "rule": "Aliases are hints only. Project schedule/context and model evidence may override. Always preserve raw label.",
  "types": {
    "bedroom": [
      "BED",
      "BR",
      "BEDROOM",
      "MASTER BED",
      "MASTER BEDROOM",
      "GUEST BED",
      "GUEST ROOM"
    ],
    "toilet": [
      "TOI",
      "TOILET",
      "WC",
      "W.C.",
      "RESTROOM",
      "POWDER ROOM"
    ],
    "bathroom": [
      "BATH",
      "BATHROOM",
      "BATH RM"
    ],
    "ensuite": [
      "ENS",
      "ENSUITE",
      "EN-SUITE",
      "ATTACHED BATH"
    ],
    "kitchen": [
      "KIT",
      "KITCHEN",
      "KITCHENETTE"
    ],
    "pantry": [
      "PANTRY",
      "PTRY"
    ],
    "living": [
      "LIV",
      "LIVING",
      "LIVING ROOM",
      "LOUNGE",
      "SITTING",
      "SITTING ROOM"
    ],
    "dining": [
      "DIN",
      "DINING",
      "DINING AREA"
    ],
    "living_dining": [
      "LIV/DIN",
      "LIVING/DINING",
      "LIVING & DINING"
    ],
    "corridor": [
      "CORR",
      "CORRIDOR",
      "PASSAGE",
      "HALLWAY"
    ],
    "lobby": [
      "LOBBY",
      "FOYER",
      "ENTRANCE LOBBY"
    ],
    "lift_lobby": [
      "LIFT LOBBY",
      "ELEVATOR LOBBY"
    ],
    "stair_lobby": [
      "STAIR LOBBY",
      "STAIR HALL"
    ],
    "store": [
      "STORE",
      "ST.",
      "STOR.",
      "STORAGE"
    ],
    "utility": [
      "UTILITY",
      "UTIL",
      "LAUNDRY"
    ],
    "balcony": [
      "BAL",
      "BALCONY"
    ],
    "terrace": [
      "TERR",
      "TERRACE",
      "ROOF TERRACE"
    ],
    "verandah": [
      "VER",
      "VERANDA",
      "VERANDAH"
    ],
    "garage": [
      "GARAGE"
    ],
    "carport": [
      "CARPORT"
    ],
    "parking": [
      "PARKING",
      "CAR PARK"
    ],
    "office": [
      "OFFICE",
      "OFF."
    ],
    "meeting_room": [
      "MEETING",
      "MEETING ROOM",
      "CONFERENCE"
    ],
    "reception": [
      "RECEPTION",
      "RECEP"
    ],
    "plant_room": [
      "PLANT",
      "PLANT ROOM",
      "MECH",
      "MECHANICAL ROOM"
    ],
    "electrical_room": [
      "ELEC",
      "ELECTRICAL",
      "ELECTRICAL ROOM"
    ],
    "service_room": [
      "SERVICE ROOM",
      "SERV."
    ],
    "common_area": [
      "COMMON AREA",
      "COMMON"
    ],
    "unknown": []
  }
}
```
