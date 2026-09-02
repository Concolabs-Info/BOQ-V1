# Dimension — shared shell

The drawing view for one Takeoff child. Same chrome for Doors, Walls, Floor. Overlays belong to the element. Tools are shared. Draw’s live shapes belong to the element.

Chat lives here only.

## Happy path

1. The user opens a Takeoff child and stays on **Dimension**, or lands here from Workbook via Show on drawing.
2. Left shows two tabs at the top: Viewports and Families.
3. Center shows the selected sheet. Found items are drawn on it.
4. The user uses the shared tools. Draw’s shape follows this child. Muted shapes stay visible and cannot be used.
5. Questions appear in Takeoff on the right. They answer them here.
6. Quantity confirm is Workbook, not this view.

## Layout

```text
┌────────────────┬──────────────────────────┬─────────────────┐
│ Viewports |    │  Select Hand Measure Draw │ Takeoff | Item  │
│ Families       │  Layers Snap   Fit Undo ⌫ │ questions       │
│ (one tab open) │  sheet + overlays · map  │ or selection    │
└────────────────┴──────────────────────────┴─────────────────┘
```

## Left pane

Two tabs at the top of the pane. One open at a time.

**Viewports**  
Sheets this child needs: plans, and any schedule or spec clip that is a source. Click one: that sheet opens in the center. Selected crop sharp, rest faded.

**Families**  
Types for this child. Click one: matching overlays highlight, and the source of that type is available. Fields on the type are editable. Edit → Save.

Families are types. Layers are what is drawn. They are not the same list.

## Center pane

The selected sheet.

### Minimap

Bottom-right of the sheet. A small map of the whole page. The current crop is a rectangle on that map. Click or drag the rectangle to jump.

Toggle. Off by default.

The minimap is this sheet only. It is not 3D. 3D stays its own view.

## Tools

Same bar on every child. Two groups.

Left of the canvas — work:

```text
Select   Hand   Measure▾   Draw▾   Layers   Snap
```

Right of the canvas — look and edit:

```text
Fit    Minimap    Undo    Delete
```

Select is the default when the user enters Dimension.

| Tool | Kind | Does |
|---|---|---|
| Select | mode | Pick an overlay. Move or resize it the way that child allows |
| Hand | mode | Pan |
| Measure | mode | Inquiry only. Does not write a quantity |
| Draw | mode | Adds a real instance for this child. A child may also Remove |
| Layers | flyout | Show or hide overlays. Not a mode |
| Snap | toggle | On or off. Not a mode |
| Fit | action | Whole sheet. Not a mode |
| Minimap | toggle | Shows or hides the page map |
| Undo | action | Last canvas change |
| Delete | action | Removes the selected overlay |

Zoom is the wheel, not a tool.

### Measure

One button. Three options. All show a calibrated length.

| Option | Constraint |
|---|---|
| Horizontal | Locked to X |
| Vertical | Locked to Y |
| Any | Free. Angle from the start point, drawn as an arc |

The measure is temporary. Click away, it goes. It never becomes a workbook row.

### Draw

Draw is Add by default. Not markup. Add creates an instance that belongs to this child and a family.

The menu always shows all three shapes. The current child mutes what does not apply. Muted stays visible and cannot be clicked.

A child may add a **sign**: Add or Remove. Doors do not. Floor and Ceiling do. Walls do not — Draw is Add. Remove deducts from a host. It has no family and no family popup.

A child may split or merge a run. Walls do. That is not a toolbar mode. Select the run, click to split. Merge is on Item.

| Shape | How |
|---|---|
| Line | Two points |
| Box | Two corners |
| Polyline | Click, click… double-click to close. First and last points join |

Which shapes are live is defined on the child. Example: Doors keep Box and Polyline; Line is muted. Walls keep Line; Box and Polyline are muted.

After a draw: a popup. Pick an existing family or create a new one. New-family fields belong to the child.

### Layers

A toolbar button. Opens a flyout. Not a left tab. Not the Families list.

The flyout is an accordion of what is drawn on this child. Tick a parent to show or hide that whole set. Open the parent to tick types.

Off is hidden, not deleted. Boxes come back when the layer is on again.

The child names the rows. Shared idea:

```text
☑ Viewport
☑ Doors ▾
    ☑ D1
    ☑ D2
☑ Windows ▾
    ☑ FW2
```

**Viewport** is the current sheet. Off hides the drawing. Overlays can stay.

Families (left tab) still edit the type. Layers only change what is visible.

### Snap

A toggle. Off until the user turns it on. When on, Measure and Draw snap to ends, corners, and existing overlays. Snap types (midpoint, intersection) are not on the bar.

## Right pane

Two tabs.

**Takeoff** — this child’s questions. Text, choice, yes/no, type-if-no, table.

**Item** — the selected instance or family. Not the section quantity confirm.

If a question is waiting, Takeoff is the open tab. Otherwise Item.

## Buttons and controls

| Control | What it does |
|---|---|
| Viewports tab | Shows the sheet list |
| Families tab | Shows the type list |
| Viewport | Opens that sheet |
| Family | Selects that type and its overlays |
| Save on a family | Stores field edits |
| Select | Default. Pick and move an overlay |
| Hand | Pan |
| Measure | Horizontal, Vertical, or Any |
| Draw | Line, Box, or Polyline. Child mutes the rest. Sign is Add unless the child offers Remove |
| Layers | Flyout. Show or hide overlays and types |
| Snap | Toggle |
| Fit | Whole sheet |
| Minimap | Toggle. Off by default |
| Undo | Last canvas change |
| Delete | Removes the selected overlay |
| Answer in Takeoff | Sends the question result |

Show on drawing from Workbook uses this shell: same child, correct viewport, those instances selected.

## What the user can do

- Open the drawings this child uses
- See types and edit them
- Correct geometry the way that child allows
- Draw a missing instance with the shapes this child allows
- Measure a calibrated length without changing quantities
- Open the minimap to see where they are on the sheet
- Answer questions without leaving the drawing

A confirm on a family field stands until they edit it. Then they save and confirm again. Same rule as Pre.

## What the user cannot do here

- Confirm the section quantity lines. That is Workbook.
- Open 3D. That is the 3D view.
- See another child’s overlays as the main set.
- Write a quantity with Measure.
- Use a muted Draw shape.

## Not decided

See `open-questions.md` Takeoff / Dimension.
