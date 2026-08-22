# Pre — 01 Upload

The user brings drawing PDFs into the project. The product never names the sample building.

## Happy path

1. The user sees a drop surface. The copy is “Drop your PDF”. They can drop one file or more than one.
2. The product opens each page, in order, and runs a scan line from the top of the page to the bottom. Then it moves to the next page. This can take one to three minutes. The user can watch the pages go by.
3. After the scan, the user sees a sheet list taken from the title blocks: drawing number, title, revision. The list is a grid. A row can be expanded. Each row has a control to keep the sheet in the job or leave it out.
4. Sheets left out do not appear in Plans, Scale, or Specifications. The user can turn a sheet back on later.
5. The user then has a workspace: page thumbnails on the left, the current page in the center, chat on the right. Chat offers **Start**. Start continues to Plans.

## Layout

Same chrome as `layout.md`. This child’s body has more than one state.

### State A — drop

```text
┌─────────────────────────────────────────────┐
│  Drop your PDF                              │
│  one file or more than one                  │
└─────────────────────────────────────────────┘
```

No left list. No canvas. No chat yet.

### State B — scan

```text
┌─────────────────────────────────────────────┐
│  Current page, full in the center           │
│  A scan line moves top → bottom             │
│  Then the next page                         │
└─────────────────────────────────────────────┘
```

The user is watching. There is no confirm on this state.

### State C — sheet grid

```text
┌─────────────────────────────────────────────┐
│  Grid of sheets                             │
│  drawing number · title · revision          │
│  expand a row · include / exclude           │
└─────────────────────────────────────────────┘
```

### State D — workspace

```text
┌──────────────┬──────────────────┬───────────┐
│ Thumbnails   │ Current page     │ Chat      │
│ of pages     │                  │ Start     │
└──────────────┴──────────────────┴───────────┘
```

How C and D follow each other is not fully decided. See `open-questions.md` items 6 and 7.

## Left pane (state D)

- Vertical thumbnails of the pages that were scanned.
- Click a thumbnail: the center shows that page.
- The pane can be closed.

Whether excluded sheets still appear here is not decided.

## Center pane

- **A:** drop surface.
- **B:** the page being scanned, with the scan line.
- **C:** the sheet grid.
- **D:** the selected page, full sheet.

## Right pane (state D)

Chat. The product says the package was read and offers **Start**.

Inspector on this screen is not decided.

## Buttons and controls

| Control | Where | What it does |
|---|---|---|
| Drop / choose PDF | State A | Adds one or more PDFs |
| Include / exclude | State C, per sheet | Keeps the sheet in the job or leaves it out |
| Expand row | State C | Opens the extra fields on that sheet |
| Thumbnail | State D, left | Shows that page in the center |
| Collapse left | State D | Hides the thumbnails |
| Start | State D, chat | Continues to Plans |

## What the user can do

- Drop one PDF or several.
- Watch every page scan top to bottom.
- Read drawing number, title, and revision for each sheet.
- Expand a grid row.
- Leave a sheet out, or bring it back later.
- Click thumbnails and look at pages.
- Press Start and go to Plans.

## What the user cannot do on this screen

- Crop a viewport. That is Plans.
- Set a scale. That is Scale.
- Start takeoff. That is the last Pre child.

## Not decided

See `open-questions.md` items 4–10.
