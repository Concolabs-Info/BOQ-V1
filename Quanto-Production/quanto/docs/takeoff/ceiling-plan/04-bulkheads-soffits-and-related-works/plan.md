# Bulkheads, Soffits and Related Ceiling Works — Plan

These items are related to ceiling geometry but should not be hidden inside the normal flat ceiling area.

## Bulkheads

A bulkhead is normally a dropped/boxed ceiling feature.

Possible surfaces:

- underside;
- one or more vertical faces;
- end faces;
- perimeter edges/trims.

Sources:

- RCP outline;
- ceiling-level changes;
- section/detail;
- dimensions;
- note such as `BULKHEAD`, `DROP`, `SOFFIT`.

Create a `Bulkhead` object only when evidence supports it.

Do not treat lighting grids, linear lights or decorative rectangles as bulkheads without supporting evidence.

## External soffits

Examples:

- underside of balcony slab;
- entrance canopy;
- verandah/porch roof underside;
- covered external walkway;
- roof overhang/eaves soffit when within scope.

Floor data can tell us the external area below, but the system must confirm there is an overhead surface.

Use plan + section/elevation/roof detail/specification as needed.

## Exposed slab soffits

An exposed structural slab can still receive:

- paint;
- plaster/skim;
- coating;
- acoustic treatment.

Keep `construction/system = exposed_soffit` separate from `finish = paint/coating/etc.`.

## Stair soffits

Coordinate with the Stair/Ramp element if that element already owns detailed stair geometry.

Ceiling should consume the accepted stair soffit geometry where possible instead of detecting the same staircase independently.

## Beams/downstands

If beam soffits/sides receive the same ceiling finish and need separate measurement, create reusable faces from structural/ceiling geometry.

Do not assume all beams are part of the ceiling finish BOQ.

## Cornices, trims and perimeter items

These can often be derived from accepted CeilingZone boundary edges if the specification/schedule says they exist.

Examples:

- cornice;
- shadow gap;
- edge trim;
- perimeter channel;
- movement/separation trim where specified.

The resolver must know which edges are valid. Do not blindly use the complete room perimeter.

## User edits

User can add/remove/edit:

- bulkhead footprint;
- drop height;
- face type;
- soffit polygon;
- finish assignment;
- valid perimeter edges;
- exclusions/openings.
