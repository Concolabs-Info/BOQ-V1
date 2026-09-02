# Waterproofing and Other Floor Works — Plan

This file defines how floor waterproofing, upturns, membranes, coatings and other floor-related works are located and linked to floor zones. Wet-room or balcony status is evidence, not an automatic material assumption.


## Waterproofing scope

Waterproofing is resolved from actual project evidence. Room type can help locate relevant rules,
but `Bathroom` alone is not proof that a particular system exists.


## Waterproofing workflow

## PURPOSE

Measure horizontal waterproofing coverage and its boundary work without hiding NRM rules inside a
prompt.

## SOURCES

- waterproofing/tanking specification;
- floor finish/room schedule if it states waterproofing;
- wet-area plan/notes;
- details/sections showing extents/upturns;
- keynotes/general notes;
- user confirmation.

## FLOW

1. Build `FloorWorkDefinition(type=waterproofing)` with system/material, coats/layers, base,
   protection/finish and source.
2. Resolve horizontal coverage: whole room, finish zone, shower/wet zone or dedicated polygon.
3. Resolve boundary edges/upturn/skirting/apron work separately.
4. Keep physical void/penetration geometry.
5. Code applies WS19 width/deduction rules.
6. Create separate MWOs for horizontal covering and boundary work where the rules require it.

## IMPORTANT RULES FROM THE PROJECT NRM2 SOURCE

- coverings `>500 mm` wide -> m²;
- coverings `≤500 mm` wide -> m;
- measured area is the area in contact with the base;
- no deduction for voids `≤1 m²`;
- boundary work to larger voids/perimeters is separate;
- boundary work can include upstands/downstands and similar closing/finishing work.

## EDGE CASES

- bathroom does not automatically equal waterproofed whole room;
- shower-only membrane may be smaller than room finish;
- balcony/terrace waterproofing can sit below an external floor finish;
- floor drain/recess detail may change local treatment;
- upturn height/girth must come from source/detail, not model memory;
- multiple waterproofing systems in one room require separate coverage definitions.


## Other floor works scope

Use the same reusable `FloorWorkDefinition + FloorWorkCoverage` pattern for other specified layers.
Only create a measured work type when the project evidence and measurement rules support it.


## Other floor works workflow

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
