# Roof Coverings and Build-up — Overview

## Goal

Once roof geometry is known, determine **what system/layers apply to each roof zone**.

Keep three concepts separate:

- `RoofPlane/Zone` = where
- `RoofSystemDefinition` = what the roof build-up is
- `RoofSystemAssignment` = why that system applies to this zone

## Possible sources

- direct plan text
- roof code such as R01/RF02
- colour legend
- hatch legend
- roof finish/material schedule
- room/area schedule when it includes roof scope
- specification
- general notes
- detail reference
- user-defined family

## Example

```text
Roof Plane RF-01-P01
  ↓ visible code R02
Roof Schedule
  ↓ R02 = standing seam metal roof
Specification
  ↓ insulation + underlay + fixing requirements
RoofSystemDefinition R02
```

## Main output

A reusable RoofSystemDefinition can contain:

- code/mark
- covering type
- description
- layers
- membrane/underlay
- insulation
- screed/falls/protection layer
- fixing notes
- source references
- confidence/status

One definition can be assigned to many roof planes.

## Measured vs order quantity

BOQ measured area and material-order area are different concepts.

Example:

- measured roof covering = 100.00 m²
- material factor = 1.08
- estimated order requirement = 108.00 m²

Do not automatically inflate the BOQ measurement using a waste/lap factor unless the measurement standard/project specifically requires it.
