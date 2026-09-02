# Special Ceilings — Plan

This folder handles ceiling conditions where **plan area alone is not enough** or where a normal room polygon is not the correct ceiling geometry.

## Supported special conditions

At minimum support:

- sloped/raked ceiling;
- mono-pitch ceiling;
- vaulted ceiling;
- multi-plane ceiling;
- stepped ceiling;
- dropped ceiling;
- partial suspended ceiling;
- ceiling island;
- tray/coffer when information is measurable;
- double-height ceiling;
- exposed soffit;
- stair soffit;
- external soffit;
- curved ceiling as a review/manual-enhanced case.

## Evidence sources

Special ceilings can be identified from:

- RCP;
- floor plan notes;
- sections;
- elevations;
- ceiling details;
- roof sections/details;
- spot levels;
- ceiling level tags;
- slope arrows;
- specifications.

The system should link the evidence to the same `CeilingZone` rather than creating disconnected facts.

## Use section observations from Pre before new AI analysis

Sections are often the strongest evidence for special ceilings. Pre should already have identified section views and may have stored observations such as:

- sloped/raked ceiling segment;
- high/low ceiling levels;
- bulkhead/drop;
- double-height/open-to-below;
- stair soffit;
- relevant roof/ceiling profile;
- dimensions and notes.

Special Ceiling processing should:

1. load those stored observations;
2. map them to the correct level and room/ceiling zone using section ID/cut location, level, room labels and plan context;
3. create the special-ceiling candidate;
4. call the section model again only if an important fact is missing or ambiguous;
5. let code construct/measure the surface;
6. let the user edit or confirm the result.

Pre evidence is therefore **input evidence**, not a final measured Ceiling object.

---

## Sloped/raked ceiling

Store:

- plan footprint polygon;
- slope direction;
- high level;
- low level;
- or slope angle if explicitly given;
- reference line/edge that the levels apply to;
- section/detail evidence;
- confidence.

Do not calculate the true area in the model.

## Vaulted ceiling

A vaulted ceiling can have multiple planes meeting at a ridge/high line.

Store either:

- separate plane footprints and their slope data; or
- enough ridge/high-line and edge-level information for deterministic construction.

If the information is not sufficient, ask the user for the missing geometry rather than inventing it.

## Dropped/stepped ceilings

A room can contain multiple flat zones at different heights.

Each horizontal zone is a CeilingZone or sub-zone.

Vertical transition faces can be separate `BulkheadFace`/special face objects if they are measured as finishes.

## Ceiling island

Store the island polygon and height separately from the base ceiling/soffit behind it.

The island does not erase the base condition unless the drawing/specification says it replaces it.

## Double height

Connect the ceiling to the lower room/space but save its actual elevation/level.

Do not create duplicate ceiling quantities at the intermediate floor.

## Exposed soffit

Treat exposed soffit as a valid ceiling finish condition.

The system can still resolve paint/coating/plaster finish even though no suspended ceiling system exists.

## Curved ceiling

Curved geometry needs more than a plan polygon.

If radius/profile/section information is available, code can construct the surface.

If not, create a blocking/review question.

## User edit requirements

The user must be able to:

- change special type;
- edit zone/plane polygons;
- set high/low levels;
- change slope direction;
- add/remove ridge line;
- set ceiling level;
- convert a special zone back to flat;
- mark no ceiling/open to sky;
- confirm or reject evidence.
