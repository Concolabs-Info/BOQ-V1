# Concrete Roof and Derived Materials — Plan

## Purpose

Support projects where the detected roof is an in-situ concrete roof slab and the user needs structural quantities as well as waterproofing/finish quantities.

This is an extension of the Roof workflow, not a reason to merge structural geometry with roof covering geometry.

## Data needed

Strong evidence may come from:

- slab/structural plan
- roof plan note
- section
- slab schedule
- reinforcement plan/schedule
- structural detail
- specification
- user input

Possible properties:

- slab polygon/host roof id
- slab thickness
- flat/sloping
- concrete grade/spec reference
- reinforcement evidence or factor
- soffit formwork condition
- edge formwork condition
- openings

## Direct detection vs derived factor

### Direct/evidenced

If reinforcement drawings/schedules exist, use them.

If slab thickness is shown, calculate concrete directly from geometry and thickness.

### Derived/assumed

If hidden quantities are not directly available, allow user-editable factors.

Examples:

- steel kg/m²
- timber framing m/m²
- purlins kg/m²
- battens m/m²
- fasteners nr/m²

The UI must show that these are **derived**, not detected.

## UI inside the existing Demo shell

On the selected Roof zone, add a collapsible/sectioned `Structural / Derived` area inside the existing Item/Family panel rather than redesigning the workspace.

Example fields:

```text
Roof area            100.00 m²
Slab thickness       150 mm
Concrete basis       Direct from thickness
Reinforcement        18 kg/m² (Derived)
Soffit formwork      1.00 m²/m² (Derived/Geometry)
Edge formwork        From perimeter × thickness
```

All values/factors are editable and store provenance.

## BOQ routing

The Roof page may calculate the quantities, but the BOQ engine routes them to the correct work section.

For in-situ concrete roof slabs under NRM2:

- concrete → Work Section 11
- reinforcement → Work Section 11
- formwork → Work Section 11

Roof waterproofing/covering remains under the appropriate roof-related work section.

This keeps one user workflow without producing a technically incorrect BOQ grouping.
