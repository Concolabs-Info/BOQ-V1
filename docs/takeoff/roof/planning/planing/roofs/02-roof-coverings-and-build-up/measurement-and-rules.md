# Roof Coverings and Build-up — Measurement and Rules

## Geometry basis

Always store both:

- plan/projected area
- actual roof surface area

### Flat roof

Actual area normally follows the measured roof plane area, subject to the applicable measurement rules.

### Pitched planar roof

Calculate actual surface area from validated plane geometry and pitch/3D plane data. Do not ask AI to output the final m².

### Curved roof

Use radius/profile evidence to calculate true surface area. If profile is missing, flag for review rather than inventing a curved area.

## Main area-based quantities

Possible outputs include:

- sheet roof covering
- tile/slate covering
- waterproofing membrane
- underlay
- insulation
- screed/falls layer
- protection layer
- specified roof finish

Each quantity should contain:

- measured quantity
- unit
- measurement basis
- roof zone ids
- rule id/version
- source/evidence
- status

## Upstands

Waterproofing upstand area can be derived from:

`selected upstand edge length × confirmed upstand height`

Keep selected edges editable. Do not assume every roof perimeter has the same upstand.

## Openings/deductions

The rules engine applies NRM2/project-specific deductions. The detector only supplies opening geometry.

Do not delete small openings from geometry just because the current standard does not deduct them; store them and let the rules engine decide.

## NRM2 work-section routing

Typical primary mappings:

- sheet roof covering → Work Section 17
- tile/slate roof covering → Work Section 18
- waterproofing → Work Section 19
- insulation → Work Section 31
- rooflights/skylights → appropriate Work Section 23 item when applicable
- roof drainage → Work Section 33 where applicable

NRM2 is a rules engine configuration. The physical roof objects should remain reusable for other standards later.

## Material factors

Allow optional factors for material planning:

```text
Underlay factor: 1.05 m²/m²
Insulation factor: 1.00 m²/m²
Sheet order factor: 1.08 m²/m²
```

Store:

- base measured quantity
- factor
- derived requirement

Do not replace the base measured BOQ quantity with the derived requirement.
