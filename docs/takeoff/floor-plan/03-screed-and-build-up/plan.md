# Screed and Floor Build-Up — Plan

This file defines how screeds, beds, toppings and related floor build-up layers are discovered, linked to finish zones and carried into measurement. They should be derived from evidence, not assumed from the finish name.


## Scope

Screed is a separate measured work type even when it uses the same coverage as the floor finish.
It should reuse finish/space geometry when the extents are identical.


## Screed plan

## PURPOSE

Resolve whether screed/bed/topping exists, what type it is, where it applies and how it is
measured.

## SOURCES

- floor finish schedule/build-up;
- room finish schedule;
- specification;
- floor detail/section;
- plan notes/tags;
- user confirmation.

## FLOW

1. Build `FloorWorkDefinition(type=screed)` with material, thickness/coats, falls/slope and source.
2. Resolve scope by explicit zone/detail -> exact room rule -> finish-family build-up -> scoped
   specification/default.
3. Reuse FinishZone/FloorSpace geometry if coverage is identical.
4. Create a dedicated coverage polygon only when the screed extent differs.
5. Validate missing/conflicting thickness/system/falls facts.
6. Code measures geometry and applies WS28 Item 1 rules.

## DO NOT ASSUME

- every tile finish has screed;
- the screed thickness from one room applies project-wide;
- a finish family field is enough if a stronger detail overrides it;
- volume is the NRM quantity merely because thickness is known.

## NRM2 IMPLEMENTATION FACTS

Project source extraction records WS28 Item 1 as `m or m²`, split at `≤600 mm` / `>600 mm`, with
level/falls/slope classifications and thickness/coats stated. Rule engine owns this.

## VALIDATION

- coverage is fully explained by evidence;
- no duplicate area when a screed references a finish zone;
- slope/falls data is kept as classification evidence;
- unknown required facts create a guidance question.


## Related floor works

Use the same reusable `FloorWorkDefinition + FloorWorkCoverage` pattern for other specified layers.
Only create a measured work type when the project evidence and measurement rules support it.


## Underlays, insulation, membranes and treatments

## POSSIBLE WORK TYPES

Depending on the project:

- rigid/board floor insulation;
- quilt insulation where applicable;
- isolation/separation membranes;
- acoustic/resilient layers;
- underlays/backings;
- sealers/coatings/surface treatments;
- primers or proprietary layers when independently measured by the chosen rules;
- other explicit floor build-up items.

## FLOW FOR EVERY TYPE

1. Extract a definition from schedule/specification/detail.
2. Classify its actual material/function; do not rely on a vague word alone.
3. Resolve coverage to a space/finish zone or dedicated geometry.
4. Store thickness/layers/background and other required facts.
5. Validate conflicts/missing scope.
6. Code measures using the appropriate versioned rule.

## IMPORTANT CORRECTION

Do **not** map every generic `underlay` to one NRM item. In the project NRM source, WS28 has explicit
underlay/insulation facts for floor finishes and separate insulation/isolation items exist. The
actual product/function must be known before classification.

## NO DOUBLE OWNERSHIP

If a finish description says it includes an underlay as part of the finish system and the rules
say it is included, do not also create a separate BOQ quantity. Quantity ownership is decided by
rules and evidence, not by how many words were extracted.
