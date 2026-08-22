# Pre — 07 Start takeoff

The last Pre child. The user leaves Pre and opens Takeoff.

## Happy path

1. The user opens **Start takeoff** in the Pre group.
2. They press **Start takeoff**.
3. Takeoff becomes the open group. Pre can still be opened again later.

There is no required summary on this screen.

## Layout

```text
┌─────────────────────────────────────────────┐
│  Start takeoff                              │
└─────────────────────────────────────────────┘
```

Whether the three panes are still on this screen is not decided. The only locked control is the button.

## Buttons and controls

| Control | What it does |
|---|---|
| Start takeoff | Opens the Takeoff group |

## What the user can do

- Press the button and begin Takeoff.

## What the user cannot do on this screen

- Confirm leftover Pre items. They open the child that owns that item.

## Not decided

See `open-questions.md` items 37–38. In particular: the button’s availability when some Pre items are still unconfirmed.
