# Ceiling — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

## Tree

```text
Ceilings
  C01 plaster to soffit
    First
    Typical 2nd–5th
    Sixth
  C02 moisture-resistant
    First
    Typical 2nd–5th
    Sixth
  C03 exterior soffit
    Ground
  C04 board / gypsum
    First
    Typical 2nd–5th
  C06 painted plant
    Ground
```

Family → floor. Typical is one child with a factor **only while the height band is the same**.

On this set, Ground is 13' and Sixth is 12'. Both are **> 3.50 m**. First and 2nd–5th are 11' (**≤ 3.50 m**). Sixth therefore leaves Typical and is its own line. Ground never sits in Typical.

Types that only exist on Ground have no typical child. Open terrace and flower troughs have no line.

Rooms stay on the drawing. Living and master bedroom are both C01. They add into one C01 / First line.

## Grid

Same shared columns. This child adds **Height**.

| Extra column | Role |
|---|---|
| Height | `≤ 3.50 m` or `> 3.50 m`. From Pre → Height for that storey. Same measured area as Qty. Not a second quantity |

Unit is **m²**.

Calc example: `498.99 × 4 = 1995.96`.

Scope examples: `Ground`, `First`, `Typical 2nd–5th`, `Sixth`.

Qty is the net soffit area: zones of that family on that floor, minus deducts. Edited in the grid. Save, then Confirm again.

Footer always both totals. Example: `Showing 498.99 of 2840.12 m²`.

One Confirm accepts the line, including that the height band rides the same area.

No cornice column. Cornices are not in this child.

## Show on drawing

Opens Ceiling **Dimension**.

- Typical line → typical floor plan, those fills lit
- First line → first floor plan
- Ground line → ground floor plan
- Sixth line → typical floor plan (same sheet), those fills lit

## Create bill lines

Not on this screen. End of job.
