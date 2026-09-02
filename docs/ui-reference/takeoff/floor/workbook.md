# Floor — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

## Tree

```text
Floors
  F01 porcelain tile
    First
    Typical 2nd–6th
  F02 wet-area tile
    First
    Typical 2nd–6th
  F05 heavy-duty porcelain
    Ground
    First
    Typical 2nd–6th
  F08 concrete
    Ground
  F09 epoxy
    Ground
  F07 sports
    Terrace
  F10 anti-slip
    Terrace
  F12 drainage
    Terrace
```

Family → floor. Typical is one child with a factor. Types that only exist on Ground or Terrace have no typical child. First is its own line. It is not inside Typical.

Rooms stay on the drawing. Living and master bedroom are both F01. They add into one F01 / First line.

## Grid

Same shared columns. This child adds **Screed**.

| Extra column | Role |
|---|---|
| Screed | Thickness / mix from the family. Blank if none. Same measured area as Qty. Not a second quantity |

Unit is **m²**.

Calc example: `498.99 × 5 = 2494.95`.

Scope examples: `Ground`, `First`, `Typical 2nd–6th`, `Terrace`.

Qty is the net finish area: zones of that family on that floor, minus deducts. Edited in the grid. Save, then Confirm again.

Footer always both totals. Example: `Showing 498.99 of 3120.45 m²`.

One Confirm accepts the line, including that screed rides the same area.

No skirting column. Skirtings are not in this child.

## Show on drawing

Opens Floor **Dimension**.

- Typical line → typical floor plan, those fills lit
- First line → first floor plan
- Ground line → ground floor plan

## Create bill lines

Not on this screen. End of job.
