# Ceiling Finishes — Overview

This folder explains how Quanto identifies **what ceiling finish/type applies to each CeilingZone**.

Geometry and finish are separate problems.

```text
CeilingZone = where
CeilingFinishDefinition = what
CeilingFinishAssignment = why this finish applies here
```

This separation is important because the drawing package can express finishes in many different ways.

## Common ways ceiling finishes are shown

Quanto must support all of these:

- direct code inside a zone: `C01`, `CL-02`, `CT3`;
- room finish schedule: `Bedroom → C01`;
- ceiling schedule;
- finish/material schedule;
- colour-coded RCP + legend;
- hatch/pattern + legend;
- direct note: `GYPSUM BOARD CEILING`;
- keynote/detail callout;
- specification rule;
- general note: `unless noted otherwise...`;
- room-type rule: all bathrooms use moisture-resistant ceiling;
- explicit exception notes.

Do not design the system around one convention.

## Main output

Build a reusable project finish library such as:

```text
C01
  system: suspended gypsum board ceiling
  finish: acrylic emulsion paint
  board: moisture resistant / standard as specified
  thickness: if stated
  grid/suspension: if stated
  source: schedule/specification refs
```

Then assign the library item to zones.

## Why a finish library matters

If 30 rooms use `C01`, do not duplicate the full specification 30 times.

Store one `CeilingFinishDefinition` and 30 `CeilingFinishAssignment` records.

This makes revision handling much easier.

If the schedule changes `C01`, every linked zone can be invalidated/recalculated without changing the geometry.

## Room normalization

Room type can be useful when the specification gives rules such as:

- all bedrooms = C01;
- bathrooms/WC = C03;
- corridors = C02;
- external soffits = C05.

Use the normalized Floor room type, but keep original room labels as evidence.

Room-type rules are a fallback/explicit specification rule, not a reason to ignore stronger plan-specific evidence.

## Final quantity

The finish resolver chooses the finish/type.

The geometry/measurement service calculates the quantity.

Do not let schedule extraction or the model return the official area.
