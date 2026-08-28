# Roof — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

Two parents. Same zones. Covering is the fill. Upstand is the edges that turn up.

No typical factor. Scope is Terrace or Upper roof. Not First. Not 2nd–6th.

## Tree

```text
Coverings
  R01 two-layer bitumen
    Terrace
    Upper roof
  R03 root-resistant
    Terrace
Upstands
  U01 300 mm
    Terrace
    Upper roof
```

Family → scope. Types that only exist on Terrace have no Upper roof child. Empty Upper roof is listed as missing, not hidden, only in Dimension. It does not invent a zero row here.

Zones stay on the drawing. Open terrace and a covered plant pad can both be R01. They add into one R01 / Terrace line.

## Grid

Same shared columns.

**Coverings rows** add:

| Extra column | Role |
|---|---|
| Pitch / falls | Level / to falls / pitch stated |
| Layers | 2, or liquid |

Unit is **m²**.

Calc example: `356.75`.

Qty is the net covering area: zones of that family on that scope, minus deducts.

**Upstands rows** add:

| Extra column | Role |
|---|---|
| Height | 300 mm, or the family height |

Unit is **m**.

Calc example: `106.16` (edges that are on).

Qty is the net girth of edges marked as upstand on those coverings.

Edited in the grid. Save, then Confirm again.

Footer always both totals, **per parent**. Example: `Showing 356.75 of 449.28 m²` while a Coverings family is filtered. Switching to Upstands changes the unit total to **m**.

One Confirm accepts that family / scope line.

## Show on drawing

Opens Roof **Dimension**.

- Terrace covering line → terrace plan, those fills lit
- Upper roof line → upper roof plan
- Upstand line → same plan, those edge bands lit. Section viewport if they opened source from a height mark

## Create bill lines

Not on this screen. End of job. Covering and upstand can become separate bill items then. They are already separate quantity lines here.
