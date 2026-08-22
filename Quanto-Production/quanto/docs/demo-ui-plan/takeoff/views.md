# Takeoff views

Every Takeoff child has three views. Switching view does not change child. Doors Workbook does not become Walls.

```text
[ Dimension ]  [ Workbook ]  [ 3D ]
```

## Dimension

Drawing work. Correct what was found.

Shared layout and tools. See `dimension.md`. Overlays, which Draw shapes are live, and which viewports and families appear belong to the element.

Minimap lives here. 3D does not.

Chat lives here only.

## Workbook

Quantity review for this child only.

Shared layout. Shared behaviour. The rows change with the child.

See `workbook.md`. A child may add columns or tree labels in its own `workbook.md`. It does not invent a second shell.

## 3D

Model review. Large 3D. Thin properties.

Shared layout. See `3d.md`. Which categories start sharp belongs to the element.

## Select anywhere

One object, three faces.

```text
Instance
  → Dimension: overlay on a plan (box, fill, …)
  → Workbook: row under family / floor
  → 3D: mesh on a storey
```

**Show on drawing** from Workbook opens Dimension on that object.