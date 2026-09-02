# Open questions

Items marked **Answered** are decided and may be implemented. Everything else is not
decided — do not implement answers to those, and do not invent them.

Numbering is stable. Gaps mean a question was removed, not renumbered; other documents
cite these numbers.

## Layout

1. What else sits above or beside the group bar? Product name? Project name? After upload, what name is shown, given we never say the sample project name in the UI?
2. In Pre, is the Inspector tab present? If yes, what does it show on Upload, Plans, Scale, Height, and Specifications?
3. Which right-pane tab is open by default — Chat or Inspector?

## Upload

4. After the user drops files, does the scan start at once, or do they press a button to start it?
5. Can they add another PDF while a scan is running? After the sheet grid is showing?
6. After the scan, two UIs were described: a **sheet grid** (drawing number, title, revision, include/exclude) and a **workspace** (thumbnails left, drawing center, chat with Start). Are these two screens in order, or is the grid the left pane of the workspace?
7. If they are two screens, what button moves the user from the grid to the workspace?
8. Include / exclude: one control per sheet. Is that a two-state control (in / out), and does “out” hide the sheet from Plans, Scale, Specs until they turn it back on?
   **Answered.** A sheet left out is excluded from the rest of the process — Plans, Scale,
   Specifications and Takeoff. Turning it back on brings it into all of them again.
9. What can the user expand on a grid row? Only the fields already shown, or more?
10. Does **Start** on Upload go to Plans, or only unlock Plans?

## Plans

11. Are the accordion groups fixed to Plans / Elevations / Sections / Details, or can the user add a group?
12. What types can the user assign when they change a viewport (plan, elevation, section, detail, and/or a floor name)?
13. How does the user add a missed viewport — draw a box on the current page? Do they pick the page first from thumbnails?
14. Level order: does it apply only to floor-plan viewports, or to every viewport?
15. When the user is editing a viewport, is the left list still the accordion, or does a page-thumbnail list also appear?

## Scale

16. Which viewports must be scaled — every viewport, or only floor plans and the elevation/section used for height?
    **Answered.** Every viewport must be scaled.
17. If printed scale, page scale, and measured X/Y disagree, the user chooses. Is that choice always a chat question with those options?
18. Units in the distance popup: which units are offered?
19. After confirm, what exactly is shown as evidence in chat — the printed text, the two lines, the error, all of them?
20. If several viewports sit on one page, does confirming one offer to reuse that scale on the others? Not decided.

## Height

21. Which viewport is the working drawing — any elevation/section the user picks, or a specific one?
    **Answered.** Height lists eligible confirmed-scale sections and elevations. The user
    chooses one primary source and may add one supporting source before detection runs.
22. Does the user confirm each storey, or confirm the whole stack once?
    **Answered.** The whole stack once. The user works on the elevation and confirms all
    storey heights together.
23. Typical floors look the same on this set. Does the user edit every storey, or edit one typical storey and apply it?

## Takeoff / Slab

24. On the section, does the user confirm each storey, or confirm the whole stack once?
    **Answered.** The whole stack once, the same way as Height — the user works on an
    elevation and confirms every slab together.
25. Can they switch to a different elevation/section and keep working on the same stack?
26. Typical floors look the same on this set. Does the user edit every storey thickness, or edit one typical storey and apply it?
27. Does Slab need Height confirmed first?
    **Answered.** No. The plate is taken by drawing a polygon along the edges of the slab,
    and thickness comes from the slab's own top and bottom — not from floor-to-floor
    height.
28. Does Slab need Beams confirmed before through-beam deducts appear, or do unconfirmed through-beams still show faded?
    **Answered.** Unconfirmed through-beams still show, faded. Slab does not wait for Beams
    to be confirmed.

## Specifications

30. How is the left list grouped? One accordion of specification sections (finishes, door/window schedule, unit areas, foundation details, …)?
31. Can the user add a missed table by cropping, or only review what is already listed?
32. Can they edit a cell in the cleaned table?
33. Clicking a row: does the canvas jump to that cell on the sheet?
34. Notes were removed. Is every remaining text block still a specification item, or only tables and schedules?
    **Answered.** Notes are kept, but not as a specification category. A note is a child
    element of the viewport it sits on — notes on a foundation pile page belong to that
    viewport, marked as a note. Notes do not need scaling.

    Notes are also a data source, not only display: material specifications such as
    concrete grade are read from them.

## Confirm / save

35. After the user **saves** an edit on a confirmed item, and has not pressed **Confirm** again, what is the state of that item? Saved-not-confirmed, or something else?
    **Answered.** Saved-not-confirmed. The item keeps the edit and is not confirmed again
    until the user confirms it.

36. *Removed.*

## Start takeoff

37. Can the user press Start takeoff while some Pre items are still unconfirmed?
    **Answered.** No.
38. Is there any summary on that screen, or only the button?

## Takeoff / Doors & Windows

No open questions that block this child.

## Takeoff / Floor

No open questions that block this child.

## Takeoff / Ceiling

No open questions that block this child.

## Takeoff / Walls

No open questions that block this child.

## Takeoff / Roof

No open questions that block this child.

## Takeoff / Slab

See items 24–28. 24, 27 and 28 are answered. 25 and 26 are not — do not invent answers.

## Takeoff / Columns

No open questions that block this child.

## Takeoff / Beams

No open questions that block this child.

## Takeoff / Stairs & Ramps

No open questions that block this child.

## Takeoff / Foundation

No open questions that block this child.

## Takeoff / 3D

39. If a section crop is short of the cut drawn on the plan, does the user nudge the billboard, or does the product place it and they only pick it from the dropdown?

## BOQ

Not designed. Combined workbook at the end of the job. Do not invent that screen yet.
