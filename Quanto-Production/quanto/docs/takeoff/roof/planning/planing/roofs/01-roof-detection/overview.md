# Roof Detection — Overview

## Goal

Find every physical roof surface that must become a measurable Roof object.

Roof detection answers **WHERE and WHAT SHAPE**. It does not produce final BOQ quantities.

## Inputs

Primary input comes from Pre:

- selected roof plan/crop
- source page and crop coordinates
- related section/elevation/detail evidence if needed
- extracted text/coordinates
- scale and level evidence
- revision information

## Outputs

The detection result should contain:

- RoofRegions
- RoofPlanes
- RoofEdges
- RoofOpenings
- drainage evidence
- pitch/slope evidence
- material/code evidence visible on the drawing
- reference markers
- uncertainty/review items

## Main principle

A roof can contain one or many planes.

Examples:

- simple flat slab → usually one plane
- gable roof → usually two planes
- hip roof → several planes
- intersecting roof → several planes with ridges/hips/valleys
- curved roof → curved surface type; do not invent fake planar splits

## Coordinate rule

The model returns coordinates in the exact detection image coordinate space.

Store:

- image width
- image height
- origin = top-left
- source page/crop transform

Canvas zoom/resizing must never alter measured geometry.

## AI role

AI understands:

- which surfaces are roofs
- topology
- plane boundaries
- roof type
- supported pitch/slope evidence
- meaningful edges/openings

## Code role

Code checks:

- polygon validity
- overlaps/gaps
- plane/edge relationships
- coordinate bounds
- scale
- actual area
- lengths
- deductions

## User role

The user can correct anything before final confirmation.
