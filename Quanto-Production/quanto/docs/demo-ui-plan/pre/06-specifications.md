# Pre — 06 Specifications

The user checks the written information that supports the drawings.

**Specification** here means that whole supporting set: specification text, schedules, and tables. Door and window schedules are specification. Unit floor areas are specification. Finish tables are specification. Notes were dropped and are not a category on this screen.

If a schedule is not in the set, that category stays visible as **not found**. It is not hidden and there is no skip control.

## Happy path

1. The user opens Specifications. The left list shows the specification items the product found.
2. The user picks one. The center opens on the sheet it came from. The relevant region is sharp. The rest is faded.
3. The center has two tabs:
   - **PDF** — the real sheet (table, image, or mixed)
   - **OCR** — the text the product read, and, when the source is a table, the cleaned table next to that read
4. The user checks that the read matches the sheet. Then they confirm that item.

## Layout

```text
┌──────────────┬──────────────────────────┬────────────┐
│ Spec items   │ [ PDF ] [ OCR ]          │ Chat       │
│ finishes     │ sheet or read + table    │ confirm    │
│ door/window  │                          │            │
│ unit areas   │                          │            │
│ …            │                          │            │
└──────────────┴──────────────────────────┴────────────┘
```

How those items are grouped in the left list is not decided.

## Left pane

- The specification items / categories.
- A category with no source stays in the list as not found.
- Click an item: the center shows its sheet and its read.
- The pane can be closed.

## Center pane

Two tabs.

**PDF**
- The real page. The table or block in use is sharp. The rest is faded.

**OCR**
- The text taken from that region.
- If the source is a table: the raw read and the cleaned table, so the user can see both.

## Right pane

Chat. The product can say which item is open and offer **Confirm**.

Inspector contents are not decided.

## Buttons and controls

| Control | What it does |
|---|---|
| Item in the list | Opens that specification on the sheet |
| PDF tab | Shows the real page |
| OCR tab | Shows the read, and the cleaned table when there is one |
| Confirm | User accepts that item |
| Collapse left | Hides the list |

Editing a cell, cropping a missed table, and jumping from a table row to a cell are not decided.

## What the user can do

- See specification and schedules in one place.
- See the real sheet and the read side by side (via the two tabs).
- See that a missing schedule is missing, not quietly skipped.
- Confirm only what they accept.

A confirm stands. If they edit a confirmed item, it is no longer confirmed. They save, then confirm again. Leaving with unsaved edits opens a popup: save or discard.

## What the user cannot do on this screen

- Treat notes as a specification category.
- Start takeoff. That is the next child.
- Change a viewport box. That is Plans.

## Not decided

See `open-questions.md` items 30–34.
