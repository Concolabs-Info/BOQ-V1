# Walls — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

Two parents. Same centerlines. Masonry is one measure. Finishes ride that measure.

## Tree

```text
Walls
  M01 225 external
    First
    Typical 2nd–6th
  M03 115 partition
    First
    Typical 2nd–6th
  M06 parapet
    Terrace
Finishes
  W01 plaster + acrylic
    First
    Typical 2nd–6th
  W05 exterior render
    First
    Typical 2nd–6th
```

Family → floor. Typical is one child with a factor. Types that only exist on Ground or Terrace have no typical child. First is its own line.

Runs stay on the drawing. Many M01 runs add into one M01 / First line. A run with W05 on side 1 and W01 on side 2 feeds **both** finish lines.

## Grid

Same shared columns.

**Walls rows** add:

| Extra column | Role |
|---|---|
| Thickness | From the family |
| Height | Storey from Pre, or the override |
| Deducts | Openings > 0.50 m² on those runs |
| Finish 1 | W-code on side 1. Not a quantity |
| Finish 2 | W-code on side 2. Not a quantity |

Unit is **m²**.

Calc example: `(248.93 × 3.35 − 18.40) × 5 = 4074.08`.

**Finishes rows** add:

| Extra column | Role |
|---|---|
| Height | To finished ceiling (storey, unless a run overrides) |
| Faces | How many sides of those runs wear this W-code |

Unit is **m²**.

Calc example: `248.93 × 3.35 × 2 = 1667.83` when both faces are W01.

Qty for masonry is net wall area. Qty for a finish is face area of runs that wear that W-code. Same length. Not a second draw.

Edited in the grid. Save, then Confirm again.

Footer always both totals, **per parent**. Example: `Showing 834.62 of 4074.08 m²` while a Walls family is filtered. Switching to Finishes changes the unit total to that parent.

One Confirm accepts that family / floor line.

## Show on drawing

Opens Walls **Dimension**.

- Typical masonry line → typical floor plan, those runs lit
- Typical finish line → typical floor plan, runs that wear that W-code lit
- First / Ground the same way

## Create bill lines

Not on this screen. End of job. Masonry and finishes can become separate bill items then. They are already separate quantity lines here.
