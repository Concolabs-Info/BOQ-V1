# Foundation — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

CostX habit: **place the mark once**. Qty is **m³** of concrete. Count sits in the calc.

Two parents. Pile fill and cap fill. No typical factor. Scope is **Ground**.

## Tree

```text
Piles
  P1 600 dia bored
    Ground
  450 dia bored
    Ground
Pile caps
  1200 × 1200 × 375
    Ground
```

Family → Ground. No First. No Typical.

The family name is the mark on the sheet, or the size if there is no mark.

If the backend found nothing: both parents, **no floor children**, empty grid. Not hidden.

Instances stay on the drawing. Many P1 piles add into one P1 / Ground line.

## Grid

Same shared columns.

**Piles rows** add:

| Extra column | Role |
|---|---|
| Diameter | From the family |
| Count | How many marks. In the calc, not the unit |
| Length | Concreted length from the model (or the override). Used in the calc |
| Grade | C32/40. Not a quantity |
| Reinforcement | 12Y20 + R10 links @ 200. Reference only. Not kg |

Unit is **m³**.

Calc example: `24 × π × 0.30² × 12.50 = 169.65`.

Qty is net pile concrete: count × section area × concreted length. Edited in the grid. Save, then Confirm again.

**Pile caps rows** add:

| Extra column | Role |
|---|---|
| Section | 1200 × 1200 × 375 |
| Count | How many caps. In the calc, not the unit |

Unit is **m³**.

Calc example: `24 × 1.20 × 1.20 × 0.375 = 12.96`.

Qty is net cap concrete: count × L × W × T.

Footer always both totals, **per parent**. Example: `Showing 169.65 of 210.40 m³` while a Piles family is filtered. Switching to Pile caps changes the total to that parent.

One Confirm accepts that family / Ground line.

No reinforcement-quantity column. No test column. No bored-but-empty column.

## Show on drawing

Opens Foundation **Dimension**.

- Pile line → layout or Ground, those circles lit
- Cap line → those boxes lit
- Source → the schedule, detail, or clause

## Create bill lines

Not on this screen. End of job. Pile concrete and cap concrete can become separate bill items then. They are already two quantity lines here.
