# Workbook — shared shell

The quantities register for one Takeoff child. Same chrome for Doors, Walls, Foundation. Only the rows change.

This is not the project BOQ. Bill lines are created once at the end of the job from confirmed quantities.

## Happy path

1. The user opens a Takeoff child and chooses **Workbook**.
2. The first row is selected. The right pane shows that line.
3. They walk the tree or the grid. They read the calc. They confirm a line, or edit it, save, and confirm again.
4. **Show on drawing** opens Dimension on that family and floor, with those instances lit.
5. They return to Workbook. The same line is still selected.

## Layout

```text
┌──────────────┬─────────────────────────────┬────────────────┐
│ Tree         │ Grid                        │ Line           │
│ Family ▾     │ Family  Scope   Calc  Qty   │ calc           │
│   type ▾     │                             │ source         │
│     floor    │                             │ Show on drawing│
│ Filter       │ Section total               │ Confirm        │
└──────────────┴─────────────────────────────┴────────────────┘
```

## Left pane — tree

Hierarchy: **Family → floor**.

Click a parent to filter the grid. Click a floor child to select that line.

Typical floors are one child, not one child per storey. Ground-only types have only the floors that exist. No empty typical row.

The tree is a filter and a selection. It is not another workbook.

## Center pane — grid

Quantity lines for this child, or the filtered slice.

Shared columns:

| Column | Role |
|---|---|
| Family | Type |
| Scope | Floor or typical range |
| Calc | The multiply, written out |
| Qty | Result |
| Unit | nr, m, m², … |
| Status | Confirmed or not |
| Source | Schedule, plan, spec |

A section may add columns in its own workbook file.

Totals: always both. Example: `Showing 72 of 216 nr`.

## Right pane — selected line

Always on. First row selected when the user enters the section.

- The calc, written out
- Source. Click opens Dimension on that evidence
- **Show on drawing** — Dimension view, that family, that floor
- **Confirm**
- Qty is edited in the grid, like a cell. After an edit: **Save**, then Confirm again

No chat.

## Buttons and controls

| Control | What it does |
|---|---|
| Tree parent | Filters the grid to that family |
| Tree floor | Selects that quantity line |
| Grid row | Selects that line |
| Qty cell | Edits that quantity. They still Save and Confirm again |
| Filter | Floor, family, status |
| Show on drawing | Opens Dimension on those instances |
| Source | Opens Dimension on the evidence |
| Confirm | User accepts this quantity line |
| Save | Stores an edit. They still Confirm again |
| Discard | On the leave popup: drops the unsaved edit |

## What the user can do

- See the whole section in one workbook
- See typical floors as one factored line
- Confirm a line
- Edit a line, save, confirm again
- Jump to the drawing or the source
- Filter without creating another workbook

A confirm stands. If they edit a confirmed line, it is no longer confirmed. They save, then confirm again. Leaving with unsaved edits opens a popup: save or discard.

## What the user cannot do in Workbook

- Draw, add, or delete an instance. That is Dimension.
- See rates.
- Create bill lines. That happens at the end of the job, in BOQ.
- Open another child’s rows.

## Not decided

See `open-questions.md` Takeoff / Workbook.
