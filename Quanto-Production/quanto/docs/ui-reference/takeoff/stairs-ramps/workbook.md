# Stairs & Ramps — Workbook

Uses the shared shell in `../workbook.md`. This file is only the rows.

CostX habit: **count the flight**. Volume, formwork, and finish ride that count. Balustrade is metres from the open edges. Not a second takeoff.

## Tree

```text
Flights
  1200 wide dog-leg
    First
    Typical 2nd–6th
  1500 wide ramp
    Ground
Balustrades
  BR1
    First
    Typical 2nd–6th
    Ground
```

Family → floor. Typical is one child with a factor. First is its own line if the bottom flight differs. A ramp family and a Ground balustrade child exist **only** if the backend found a ramp.

The family name is the mark on the sheet, or the size / description if there is no mark.

Flights stay on the drawing. Several of the same type on Typical add into one Typical line.

## Grid

Same shared columns.

**Flights rows** add:

| Extra column | Role |
|---|---|
| Width | From the family |
| Risers | Count. Blank on a ramp |
| Finish | F06 on a stair. Blank on a ramp unless scheduled. Not a second quantity |
| Volume | m³. Waist + treads + mid-landing. Same nr |
| Formwork | m² soffit + mid-landing. Same nr |

Unit is **nr**.

Calc example: `1 × 5 = 5`.

Volume written out: `5 × 2.48 = 12.40 m³`.

**Balustrades rows** add:

| Extra column | Role |
|---|---|
| Height | From the family |

Unit is **m**.

Calc example: `8.40 × 5 = 42.00`.

Qty is the net girth of edges marked as rail on those flights (and on a ramp if one exists). Lift side already off.

Edited in the grid. Save, then Confirm again.

Footer always both totals, **per parent**. Example: `Showing 5 of 6 nr` while a Flights family is filtered. Switching to Balustrades changes the unit total to **m**.

One Confirm accepts that family / floor line, including that volume, formwork, and finish ride the flight count.

## Show on drawing

Opens Stairs & Ramps **Dimension**.

- Typical flight line → typical floor plan, those fills lit
- First line → first floor plan
- Ramp line → the viewport the backend sent, that fill lit
- Balustrade line → same plan, those edge bands lit
- Source on rise / waist → the section, that cut lit

## Create bill lines

Not on this screen. End of job. Count, volume, formwork, finish, and rail can become separate bill items then. They are already quantity lines here.
