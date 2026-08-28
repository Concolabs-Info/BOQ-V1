# Roof Edges, Openings and Drainage — Measurement and Rules

## Linear geometry

Code measures validated roof-edge polylines using the confirmed scale.

Possible outputs:

- ridge length
- hip length
- valley length
- eave length
- verge/rake length
- abutment length
- gutter/channel length
- flashing/capping length

## Upstand area/length

Keep both physical values available:

- edge length
- upstand height
- vertical upstand area

The active BOQ rule decides whether the item is billed by length or area and how it is described.

## Openings

For each opening store:

- type
- host roof/plane
- plan area
- perimeter
- source

Measurement rules decide deductions and any extra boundary work.

## Rooflights/skylights

Count/area and associated opening/boundary work must be kept as separate physical facts so the BOQ mapper can route them correctly.

## Drainage

Store:

- gutter/channel length
- outlet/hopper/scupper/sump number
- downpipe length where geometry/evidence exists

Typical NRM2 routing may use Work Section 33 for roof drainage items. Sheet-metal valley/gutter linings may belong to a covering work section depending on the actual construction. The rule engine decides from the system definition, not from geometry alone.

## Avoid double counting

Examples:

- valley geometry may create a tile/slate fitting item plus a separate metal lining item
- parapet wall masonry belongs to Walls, while waterproofing upstand/capping belongs to Roof
- rooflight object is not also a generic opening accessory without a rule

Every generated quantity should contain a `source_object_ids` list so duplicate derivations can be detected.
