# Skirting — Detection and Measurement Plan

Skirting is mainly a derived element. Quanto starts from confirmed room/finish geometry, determines which boundary edges receive skirting, removes valid exclusions such as door openings, resolves the skirting type from project evidence and calculates length in code.


## Scope

Skirting is mostly a **derived edge quantity**: validated room/floor geometry tells us where the
edges are; schedules/specifications tell us what skirting those edges receive.


## Skirting workflow

## PURPOSE

Create auditable net skirting lengths from Floor geometry and project finish evidence.

## SOURCES

- room/floor perimeter geometry;
- floor or room finish schedule;
- dedicated skirting/base schedule;
- specification;
- details/notes;
- door/full-height opening geometry;
- user decisions for project-specific exclusions.

## FLOW

1. Build canonical `PerimeterEdge` objects from accepted FloorSpace geometry.
2. Build/resolve `SkirtingDefinition` with mark, material, net height, profile/girth, background,
   raking/sloping/curved facts and source.
3. Assign skirting rules to rooms/finish zones by exact schedule/tag/specification evidence.
4. Find `OpeningSpan`s along perimeter edges.
5. Classify each edge/span as include/exclude/partial/unresolved.
6. Calculate net length from included world-coordinate edge segments.
7. Keep every exclusion and reason in the quantity ledger.

## COMMON EXCLUSIONS / SPECIAL CASES

Potential exclusions include:

- door openings;
- full-height glazed/open openings;
- edges where a different base detail occurs;
- fixed cabinetry/wardrobes **only when project evidence says skirting stops**;
- open balcony edges where no skirting/base exists;
- interfaces with another explicit finish system.

Do not use a global magic rule for cabinetry or joinery.

## DOOR RELATIONSHIP

Floor can initially create an OpeningSpan from plan geometry. Later Doors & Windows can reconcile
that span to a real door object. This should not require redrawing the room polygon.

## NRM2 IMPLEMENTATION FACT

WS28 Item 14 measures skirtings in metres with net height stated and additional condition/background
facts where relevant. The rule engine forms the commercial description.

## AUDIT REQUIREMENT

A QS must be able to click a skirting quantity and see the included perimeter edges plus each
excluded opening/edge. A single unexplained number is not acceptable.
