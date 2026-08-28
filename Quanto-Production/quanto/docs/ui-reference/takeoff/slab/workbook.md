# Slab — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

## Tree

```text
Slabs
  S1 150 mm
    Ground
    First
    Typical 2nd–6th
    Terrace
  S2 200 mm
    Ground
```

Family → floor. Typical is one child with a factor. Types that only exist on Ground or Terrace have no typical child. First is its own line.

Plates stay on the drawing. Several S1 plates on First add into one S1 / First line.

## Grid

Same shared columns. This child adds thickness and deducts.

| Extra column | Role |
|---|---|
| Thickness | Family, or the section override |
| Deducts | Through-beam strips on those plates. Not downstands. Not typical columns |

Unit is **m³**.

Calc example: `(516.54 − 12.40) × 0.150 × 5 = 378.11`.

Qty is net concrete: plate area minus through-beam plan area, times thickness. Edited in the grid. Save, then Confirm again.

Footer always both totals. Example: `Showing 378.11 of 890.40 m³`.

One Confirm accepts the line, including that through-beams already rode the calc.

## Show on drawing

Opens Slab **Dimension**.

- Typical line → typical floor plan, those plates lit
- Ground line → ground floor plan
- Source on a thickness → the section, that run lit

## Create bill lines

Not on this screen. End of job.
