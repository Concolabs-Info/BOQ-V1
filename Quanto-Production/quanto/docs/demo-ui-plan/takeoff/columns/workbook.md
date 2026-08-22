# Columns — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

CostX habit: **count** the column. Volume is calculated on the same line. Not a second takeoff. No formwork on Columns — concrete volume only.

## Tree

```text
Columns
  230 × 450
    Ground
    First
    Typical 2nd–6th
    Terrace
  300 dia
    First
    Typical 2nd–6th
```

Family → floor. Typical is one child with a factor. Types that only exist on Ground or Terrace have no typical child. First is its own line.

The family name is the mark on the sheet, or the size if there is no mark.

Instances stay on the drawing. Many 230 × 450 columns on First add into one First line.

## Grid

Same shared columns. This child adds section, height, and volume.

| Extra column | Role |
|---|---|
| Section | 230 × 450, 300 dia, or L/T with leg sizes |
| Height | From the model. Top of slab below to soffit of slab/beam above. Ground includes the stalk |
| Volume | nr × section area × H → m³. Section area by shape: L × W rectangular, π × D²/4 circular, sum of leg rectangles for L/T. Same count. Not a second quantity |

Unit is **nr**.

Calc example: `12 × 5 = 60`.

Volume is written out on the line. Example volume: `60 × 0.230 × 0.450 × 3.20 = 19.87 m³`.

Qty is the count. Edited in the grid. Save, then Confirm again.

Footer always both totals. Example: `Showing 60 of 214 nr`.

One Confirm accepts the line, including that concrete rides the same count.

## Show on drawing

Opens Columns **Dimension**.

- Typical line → typical floor plan, those boxes lit
- First line → first floor plan
- Ground line → ground floor plan

## Create bill lines

Not on this screen. End of job. Count and volume can become separate bill items then. They are already one quantity line here.
