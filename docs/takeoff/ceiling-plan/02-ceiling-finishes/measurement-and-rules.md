# Ceiling Finishes — Measurement and Rules

This file defines how accepted ceiling geometry becomes measurable ceiling-finish work.

## Main rule

A ceiling finish quantity is calculated from **validated ceiling surface geometry**, not from a model-provided area.

For a normal flat room with no ceiling-specific geometry change:

```text
confirmed FloorSpace polygon
        ↓ reused as CeilingZone
confirmed scale/world transform
        ↓
code calculates flat ceiling surface area
```

## 1. Flat ceiling finish

For an accepted flat CeilingZone, calculate the world-coordinate polygon area.

The room's stored floor area can be used as a cross-check, but the official ceiling quantity should be tied to the accepted CeilingZone revision.

## 2. Sloped/vaulted finish

Do not use horizontal plan area as the final finish area.

Use the `SpecialCeilingGeometry` to build the actual 3D plane(s), then calculate true surface area.

## 3. Multiple finishes in one room

Split the ceiling into separate zones and measure each zone separately.

Do not divide the room area by guessed percentages.

## 4. Multiple finish layers on one ceiling system

One ceiling zone may support several measurable layers/components, for example:

- ceiling lining/system;
- skim/plaster layer;
- paint/coating;
- acoustic treatment.

Keep the same geometry reference and create separate measured-work projections when the specification and configured measurement rules require separate BOQ lines.

## 5. Openings and penetrations

Store meaningful opening geometry where it can affect measurement.

Examples:

- large skylight/opening;
- access opening;
- major service opening;
- shaft opening.

Do **not** automatically deduct every light, diffuser, speaker or sprinkler.

The configured project/measurement-standard rule decides whether an opening is deducted, ignored, or measured separately.

## 6. Small columns/obstructions

Do not create random holes in ceiling geometry during AI detection just to force a net area.

Keep obstruction/opening evidence and let the measurement rules decide deduction treatment.

## 7. Open to sky / no ceiling

These regions produce no ceiling-finish area at that level unless a real overhead soffit/cover is separately identified.

## 8. Exposed soffit

An exposed concrete/slab soffit can still create measurable finish work such as paint or coating.

The construction type and finish layer should remain separate:

```text
construction = exposed soffit
finish = paint system P03
```

## 9. External soffit

Measure actual overhead underside geometry only.

A balcony/terrace floor below does not prove a soffit exists above.

## 10. Bulkheads and vertical faces

Do not hide vertical bulkhead faces inside the horizontal ceiling area.

Measure them as separate faces/objects where the finish scope requires them.

## 11. Perimeter items

Cornices, trims, shadow gaps and similar linear items should be derived from accepted `CeilingBoundaryEdge` geometry only when a schedule/specification says they apply.

Do not use the full room perimeter blindly.

## 12. Measurement-standard configuration

The application should not hard-code one set of deduction thresholds into the detector.

Keep a versioned `CeilingMeasurementRuleService` for the selected project measurement standard (for example the project's configured NRM/other standard) and project-specific rules.

This service controls:

- deductions/openings;
- how narrow/complex surfaces are classified;
- whether vertical faces are grouped or separated;
- description/grouping rules;
- rounding/precision;
- unit and aggregation rules.

## 13. Quantity provenance

Every final quantity must store:

- CeilingZone revision ID;
- FinishDefinition ID;
- SpecialCeilingGeometry revision if used;
- scale/world-transform version;
- measurement-rule version;
- source/evidence links;
- calculation result;
- confirmation status.

This allows the QS to trace every BOQ quantity back to its geometry and source information.
