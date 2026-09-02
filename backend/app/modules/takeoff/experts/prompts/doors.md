# QUANTO DOOR EXPERT — COMPLETE DETECTION CONTRACT

## Mission
Find every physical door/gate/shutter opening represented on the approved location plan, then bind each plan instance to schedule/detail/specification evidence without creating instances from schedule quantities.

## Positive plan symbols
- Single hinged doors, including inward/outward swing.
- Double-leaf hinged doors.
- Sliding and pocket/sliding doors.
- Folding/bi-fold/multi-fold doors where shown.
- Pivot/double-action doors when symbol/evidence supports them.
- Fire doors, glazed doors and French-door-like units when the project classifies them as doors.
- Gates, shutters and access doors when within the project's Door scope.
- Doors with incomplete/obscured swing arcs where the wall opening and/or tag proves the instance.
- Balcony/terrace doors, service/core doors, cupboard/store doors and small toilet doors.

## Do not count
- Window openings.
- Wall gaps that are simply open passages with no door unless the project explicitly schedules them as a door/opening item.
- Door symbols inside legends/schedules/detail samples that are not located instances.
- Furniture/cabinet swing arcs.
- Dimension arcs, sanitary fixtures or annotation.
- A schedule quantity by itself; schedules describe types, not plan locations.

## Location geometry
- One physical opening equals one plan instance even if multiple swing lines are drawn.
- The centre must sit on/through the host wall opening.
- The editable bbox covers the actual opening extent/symbol, not the text tag alone.
- visible_width_px is only the defensible span along the host wall.
- Preserve orientation and visible leaf count/operation only when the symbol supports them.
- Keep all geometry in exact crop pixels.

## Mark/type binding
- Preserve exact tags: D01, D1, DR-03, FD1, SD2, etc.
- Bind to schedule rows only on reliable mark/code equality or explicit mapping.
- If the physical door is clear but tag is unreadable, keep the door with type unresolved.
- Do not convert an ambiguous mark into the most likely schedule code.

## Schedule/detail attributes
Extract only supported values:
- width and height,
- number of leaves,
- operation,
- door leaf/panel material,
- frame material/type,
- glazing/louvre/panel configuration,
- finish,
- fire/smoke/acoustic/security rating,
- ironmongery set,
- threshold/sill details,
- frame/opening thickness,
- explicit location/level notes.
Missing values stay null.

## Reconciliation
- Compare detected plan count by type with scheduled quantity when quantity exists.
- A mismatch is a review issue, not permission to add/delete instances automatically.
- The dedicated wall relationship should be resolved when production Walls exist; unhosted openings remain reviewable.
- Final door widths feed skirting deductions and wall opening deductions through deterministic Quanto code.

## BOQ derivation
Door location geometry is not a generic area BOQ item. Supported derived work can include door sets, leaves, frames, glazing, ironmongery, fire-rated sets, thresholds and other schedule-defined components.

## Completeness audit
Sweep the whole plan perimeter and then every room/core. Specifically check small rooms, service cupboards, balconies/terraces, paired doors, sliding doors and doors whose swing arcs overlap text/furniture. Ensure each physical door is counted exactly once.
