# Ceiling Geometry — Overview

This folder explains how Quanto decides **where ceiling/soffit surfaces exist** and how those surfaces are connected to the already detected Floor rooms.

## Main idea

Do not redetect rooms if we already know them.

```text
Confirmed FloorSpace
        ↓
Is there a ceiling-specific drawing?
        ↓
No  → create default CeilingZone from the FloorSpace polygon
Yes → analyse RCP and map detected ceiling zones back to FloorSpace IDs
```

The ceiling detector is therefore an **override/zone detector**, not a second independent room detector.

## What a CeilingZone represents

A CeilingZone is the plan extent of one continuous ceiling condition.

A zone may represent:

- one complete room;
- part of a room;
- several open-plan room labels under one continuous ceiling;
- a corridor zone;
- an external soffit;
- a sloped ceiling footprint;
- a no-ceiling/open-to-sky region used as an exclusion.

## Geometry sources

The system can use:

- RCP;
- ceiling layout plan;
- confirmed FloorSpace polygons;
- floor plan;
- sections/elevations;
- details;
- roof/section evidence for a raked ceiling;
- notes/specifications that identify open-to-sky or special conditions.

## Main output

For every zone, keep:

- `ceiling_zone_id`;
- `floor_level_id`;
- linked `floor_space_ids`;
- source drawing/page/crop;
- source-pixel polygon;
- geometry origin: `reused_floor_space`, `rcp_detected`, `manual`, etc.;
- environment: internal/external/semi-external;
- ceiling condition: flat/sloped/vaulted/open_to_sky/etc.;
- level/height evidence if available;
- finish evidence candidates if visible;
- confidence;
- validation status.

## Default path when no RCP exists

For every accepted FloorSpace:

1. decide whether the space normally has a ceiling/soffit above;
2. create a default zone from its room polygon;
3. run special-condition checks using notes, sections and specifications;
4. remove or modify zones where evidence says there is no normal flat ceiling.

Do not automatically create a ceiling for:

- open-to-sky areas;
- true open-to-below/void spaces;
- external spaces with nothing overhead;
- shafts/open wells where no soffit finish exists at that level.

## Path when an RCP exists

1. identify which FloorLevel the RCP belongs to;
2. align RCP coordinates with the corresponding floor plan/room model;
3. detect ceiling-zone boundaries;
4. detect special conditions and level notes;
5. link each zone to one or more FloorSpace IDs;
6. compare RCP coverage against room coverage;
7. flag unexplained gaps/overlaps;
8. let the user correct the result.

## Why room geometry still matters with an RCP

Room data helps:

- identify the level;
- name zones;
- check whether a ceiling zone makes sense;
- find missed boundaries;
- connect finish schedules that are room-based;
- reconcile ceiling quantities with floor areas;
- drive 3D and BOQ grouping.

## Geometry ownership

Keep Floor and Ceiling geometry as separate objects.

A CeilingZone may initially reference a FloorSpace polygon, but once it is edited or split, it has its own versioned geometry.

Do not mutate the Floor room polygon just because the ceiling differs.
