# Roof Edges, Openings and Drainage — Plan

## Purpose

Roof area alone is not enough. Many BOQ items depend on edges, boundaries, openings and drainage.

## Edge types to support

- ridge
- hip
- valley
- eave
- verge/rake
- abutment
- parapet boundary
- waterproofing upstand edge
- pitch change
- level change/roof step
- gutter/channel edge

## How they are found

Primary:

- AI roof topology from the roof plan

Supporting:

- vector lines
- slope arrows
- material boundaries
- detail references
- section evidence

The user can reclassify an edge or draw/correct it in the existing Dimension view.

## Upstands

Do not require the user to draw a second polygon for every upstand.

Use:

- host roof zone
- selected perimeter/internal edges
- upstand family/type
- height

This matches the Demo UI concept and keeps editing simple.

## Openings

Store polygons/points for:

- rooflights/skylights
- lanternlights
- access hatches
- smoke vents
- chimneys/large penetrations
- shafts/open courtyards
- plant openings

Openings remain visible even when current measurement rules do not deduct them.

## Drainage

Detect/store where shown:

- eaves gutter
- box gutter
- valley gutter
- internal gutter/channel
- outlet
- sump
- scupper
- overflow
- hopper
- downpipe/RWP

Do not invent drainage just because a flat roof exists.

## Details and flashings

Flashings/cappings often depend on edge condition rather than area.

Resolve them from:

- detail callout
- schedule/specification
- edge classification
- user-defined roof family

## User editing

The user can:

- turn an upstand edge on/off
- change upstand height/type
- reclassify ridge/hip/valley/etc.
- add/delete opening
- resize opening
- add/remove gutter/outlet
- correct associated host roof
