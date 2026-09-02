# Beams — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

CostX habit: **measure the line once**. Volume and formwork are calculated on the same line. Not a second takeoff.

Through and downstand are **different lines** even if the section is the same. Slab needs that split.

## Tree

```text
Beams
  230 × 450
    First · downstand
    First · through
    Typical 2nd–6th · downstand
  300 × 600
    Ground · downstand
```

Family → floor, then kind if both exist on that floor. Typical is one child with a factor **per kind**. Types that only exist on Ground have no typical child. First is its own line.

The family name is the mark on the sheet, or the size if there is no mark.

Runs stay on the drawing. Many 230 × 450 downstands on First add into one downstand line.

## Grid

Same shared columns. This child adds section, kind, length, volume, and formwork.

| Extra column | Role |
|---|---|
| Section | 230 × 450 |
| Kind | Downstand / Through |
| Length | Sum of those runs, m |
| Volume | m³. Extra-over if downstand. Full rectangle if through |
| Formwork | m². Same runs |

Unit is **m³**.

Calc downstand: `12.40 × 0.230 × 0.300 = 0.855`.  
Calc through: `8.20 × 0.230 × 0.150 = 0.283`.

Qty is net concrete for that family / floor / kind. Edited in the grid. Save, then Confirm again.

Footer always both totals. Example: `Showing 0.855 of 42.10 m³`.

One Confirm accepts the line, including that length and formwork ride the same measure.

Confirmed **through** lines are what Slab shows as faded deducts.

## Show on drawing

Opens Beams **Dimension**.

- Typical downstand line → typical floor plan, those runs lit
- Through line → those runs lit
- Ground / First the same way

## Create bill lines

Not on this screen. End of job. Volume and formwork can become separate bill items then. They are already one quantity line here.
