# Floor Finishes — Overview and QS Procedure

This file defines how finish zones are measured and how floor finishes are treated as reusable finish types connected to room/zone geometry. Finish information may come from the plan itself or from schedules, legends, notes and specifications.


## Scope

Floor detection tells us **where the floor surfaces are**. Floor Finishes tells us **what finish
each surface receives**.

The design intentionally separates:

- `FinishDefinition` — what F01/F02/etc. means;
- `FinishZone` — where that finish applies.

This lets one finish definition be reused across many rooms and lets one room contain several
finish zones.


## Research notes

## HOW FINISH INFORMATION MAY BE SHOWN

There is no universal drawing style. A project may use one or several methods at once:

- mark/tag inside the room: `F01`, `FF-02`, `FL3`, `T1`;
- colour-coded finish plan;
- hatch/pattern-coded finish plan;
- direct text: `PORCELAIN TILE`, `EPOXY`, `CARPET`;
- room finish schedule: room -> floor finish;
- finish schedule: mark -> material/system description;
- legend: colour/hatch -> mark or material;
- specification: room type/area -> finish rule;
- keynote and keynote legend;
- detail/build-up tied to an area;
- general note: “unless noted otherwise ...”.

The application must resolve a **graph of evidence**, not look for one magic column.

## IMPORTANT DISTINCTIONS

### A finish family is not a room

`F01` may occur in 30 rooms. Store it once as a FinishDefinition and assign references from zones.

### One room is not always one finish

A large lobby can contain tile + matwell; a bathroom can have a shower inset; an open office can
have carpet + vinyl tea-point. Use FinishZones.

### Colour/hatch has no meaning by itself

A blue region means nothing until a legend/project source says what blue represents.

### Room type has no finish by itself

`bathroom` can be evidence for a project rule, but model memory must never invent “tile because
bathroom”.

## FINISH FACTS TO EXTRACT WHEN PRESENT

- mark/code;
- material/type;
- description;
- overall thickness;
- module/size;
- colour/finish if commercially relevant;
- background/substrate;
- backing/underlay/bedding/adhesive;
- falls/slope condition;
- internal/external use;
- related screed/build-up;
- related skirting/base;
- specification/detail/keynote references;
- exclusions/notes.

Unknown values stay null/unknown.


## QS procedure

## PURPOSE

Define how a QS should establish finish types, extents and quantities.

## INPUTS

- accepted FloorSpaces/connector/special regions;
- controlling architectural and/or finish plan;
- registered secondary finish drawings;
- finish/room schedules, legends, specifications and details;
- confirmed scale.

## DECISIONS

**D1. Build the project FinishDefinition library first.**  
Extract every explicit finish family from schedule/legend/specification/direct notes.

**D2. Discover project tag grammar dynamically.**  
If the schedule uses `FL-A`, search for that style. Do not hardcode only `F01`.

**D3. Resolve the strongest spatial evidence for every floor surface.**  
A finish can be assigned by direct tag, exact room schedule, legend-backed colour/hatch, bounded
material text or explicit project rule.

**D4. Whole-room finish can reference the FloorSpace geometry.**  
Do not copy the polygon unless a different finish boundary is actually needed.

**D5. Split genuine mixed-finish areas into FinishZones.**  
Zones must not materially overlap unless an intentional layer relationship is defined.

**D6. Door connector strips receive finish too.**  
Resolve continuity from both adjacent finishes, threshold detail or project rule. If finish
changes at the threshold and no transition line is clear, ask rather than guess.

**D7. External floor areas are resolved normally.**  
Balcony/terrace finish can be different from internal finish and may link to waterproofing.

**D8. Keep explicit no-finish regions/deductions as geometry facts.**  
NRM rule decides whether the hole is deducted from measured quantity.

**D9. Do not add waste to BOQ measured area.**  
Waste/order area can be a separate procurement value only.

**D10. Measure with code after finish resolution.**  
Use validated world geometry and rule engine; never trust model area.

## WORKED EXAMPLE

```text
Room: Bathroom 02
space area from code: 6.80 m²
plan shows blue fill
legend: blue -> F05
finish schedule: F05 -> 300x300 anti-slip porcelain tile, 9 mm
specification: wet areas on 50 mm screed to falls

Result:
  FinishDefinition F05 created once
  FinishZone references Bathroom 02 polygon
  finish evidence keeps legend + schedule
  screed evidence goes to Screed flow, not hidden inside measured finish
  quantity measured later by rule engine
```

## FALSIFICATION

If a real finish drawing cannot be expressed as definitions + spatial zones + evidence relations,
this model must change before implementation continues.
