# Layout

The chrome stays. Only the left list, the center tools, and the right-pane content change.

```text
Pre  →  Upload · Plans · Scale · Height · Slab · Specs · Start     Takeoff  →     BOQ  →
─────────────────────────────────────────────────────────────────────────────────────
 list          │  canvas                         │  Chat | Inspect
```

The three groups sit in one horizontal bar: **Pre · Takeoff · BOQ**. A group opens to the right, toward the next group, and shows its children in that gap. The groups to the right shift over. Closed, a group is just its name. Open: `Pre → Upload · Plans · Scale · …` then Takeoff, then BOQ.

## Group bar

Three groups in a row. They open to the right, like a cabinet. They do not drop down. They are not a left rail.

**Pre-takeoff children**

- Upload
- Plans
- Scale
- Height
- Slab
- Specifications
- Start takeoff

**Takeoff children** — named, not designed.

**BOQ children** — not designed.

What else sits above or beside the group bar (product name, project name) is not decided. See `open-questions.md`.

## Left pane

A list for the current child. It can be closed.

In Pre, the list is a CostX-style accordion once Plans exists: groups the user can open and close. Upload has its own left-pane behaviour; see `pre/01-upload.md`.

## Center pane

The drawing, the scan, or the current sheet. Tools belong to the current child. They do not leak into other children unless that child’s file says so.

## Right pane

Two tabs: **Chat** and **Inspector**.

Each child has its own chat. Opening Plans does not show the Upload transcript. Opening Scale does not show the Plans transcript.

What Inspector shows in Pre, and which tab is open by default, is not decided.

## What the user can always do

- Open a group and pick a child they have reached.
- Collapse the left list to give the canvas more room.
- Switch Chat / Inspector if both tabs are present.
- Open any Pre child they have reached.



## What the user cannot do yet

- Jump into a Takeoff child before they press Start takeoff. Whether Start can be pressed with work still unconfirmed is not decided.

