# Shared Ceiling System — Integrations

Ceiling is not complete until edits and measurements flow through the rest of Quanto.

## 1. Floor dependency

Ceiling reads confirmed:

- FloorLevel;
- FloorSpace;
- room labels/types;
- room polygons;
- world-coordinate transform.

Ceiling must not edit Floor geometry directly.

If Floor geometry later changes, Ceiling marks dependent default/reused zones as stale and reconciles them.

User-edited independent ceiling zones should not be silently overwritten.

## 2. Pre integration

Pre supplies:

- page classification;
- drawing title/sheet metadata;
- revision;
- floor/level assignment;
- likely RCP/section/schedule/specification sources;
- section-view bounding boxes/crops;
- reusable section observations such as levels, sloped/raked ceiling evidence, bulkheads/drops, double-height/open-to-below, stair soffits and related notes/dimensions;
- crop/viewports.

Ceiling first reuses these observations and maps them to its rooms/zones. It requests targeted section analysis only when the stored evidence is incomplete or ambiguous.

Pre owns source discovery/reusable observations. Ceiling owns ceiling interpretation, measurable geometry and quantities. Ceiling can ask Pre/source binding to reclassify a page if evidence is missing.

## 3. Canvas

Canvas should show:

- room outline/reference layer;
- CeilingZone polygons;
- finish colour/label;
- ceiling code;
- height/level;
- slope arrow/high-low levels;
- exclusions/open-to-sky;
- bulkheads/soffits;
- confidence/review state.

User actions:

- add/delete zone;
- reshape polygon;
- split/merge;
- reassign room;
- change finish;
- set level/height;
- set special type;
- edit slope;
- mark no ceiling/open to sky;
- edit bulkhead/soffit;
- confirm/reject.

## 4. Dimension

Dimension receives confirmed measurements, not raw model values.

Example:

```text
Level 01 / Bedroom 01 / C01
Ceiling area = 14.20 m²
source = CeilingZone CZ-L01-003 rev 5
```

Special ceilings should show the actual surface area and enough geometry metadata to explain the result.

## 5. Workbook

Workbook groups measurable work using the project hierarchy.

Possible grouping:

```text
Level
  → Ceiling system/type
    → Finish
      → Room/zone
```

Keep source links and measurement provenance even if the displayed workbook is simple.

## 6. 3D

Create a lightweight representation:

- polygon at ceiling level for flat zones;
- 3D plane/mesh for sloped zones;
- multiple planes for vaulted ceilings;
- box/face geometry for bulkheads;
- soffit plane for external zones.

3D is a visual/checking projection of measured objects. It is not the measurement source.

## 7. Review

Review should let a QS see together:

- source drawing;
- zone geometry;
- linked room;
- finish/type;
- level/slope;
- quantity;
- evidence;
- confidence;
- conflicts/questions.

Changes made in Review create the same domain revisions as changes made on the Takeoff canvas.

## 8. BOQ

Only confirmed `MeasuredWorkObject`s flow to BOQ generation.

BOQ description is created from:

- finish/system definition;
- location/classification;
- configured measurement standard;
- project description rules.

Do not use AI-generated prose as the commercial truth without structured source fields.

## 9. Stair/Ramp integration

If Stair/Ramp already has accepted staircase geometry, Ceiling should reuse it for stair soffit measurement.

Do not redetect the staircase independently unless that data is unavailable.

## 10. Roof integration

Roof/section geometry can support raked ceilings under pitched roofs.

The relationship is evidence/geometry reuse, not ownership transfer:

- Roof owns roof covering/roof geometry;
- Ceiling owns internal ceiling/soffit finish quantities.

## 11. Change propagation

Example:

```text
User changes Bedroom ceiling from flat to raked
        ↓
SpecialCeilingGeometry revision created
        ↓
Surface area recalculated
        ↓
Dimension updated
Workbook updated
3D updated
Review updated
BOQ affected line invalidated/rebuilt
```

This must happen through shared domain events/invalidation, not by manually updating each screen.
