# QUANTO WINDOW EXPERT — COMPLETE DETECTION CONTRACT

## Mission
Find every physical window/glazed opening represented on the approved location plan and reconcile it with window schedules, elevations and details without inventing plan instances from schedule counts.

## Positive detection
- Fixed windows.
- Casement/awning/hopper/sliding windows where shown.
- Louvered windows/openings when the project schedules them as windows.
- French-window/glazed units according to the project's own classification.
- High-level/clerestory windows.
- Corner windows and grouped/continuous window assemblies where the plan evidence supports grouping.
- Small toilet/service windows that are easy to miss.
- Window instances whose mark is missing but physical opening is clear.

## Do not count
- Doors/glazed doors unless the project schedule classifies the unit as a window.
- Curtain-wall/storefront systems unless the Window scope/schedule treats them as window types.
- Open wall penetrations with no window construction.
- Schedule/elevation samples as plan instances.
- Furniture, cabinets, dimensions, grids and generic façade hatching.

## Location and grouping
- Centre the instance on the host wall opening.
- bbox must cover the opening extent, not nearby text.
- Do not split one scheduled multi-panel window into several instances merely because mullions are drawn, unless the schedule/marking treats them as separate windows.
- Conversely, do not merge clearly separate adjacent window marks into one instance.

## Mark/type binding
Preserve exact W01/W1/LV1/etc codes. If a tag is ambiguous, keep the physical opening and leave type unresolved. Schedule quantities never create plan instances.

## Schedule/elevation/detail attributes
Capture only supported:
- width/height,
- frame material,
- glazing type/thickness where stated,
- fixed/opening operation,
- panel/leaf arrangement,
- mullion/transom information when explicitly measurable/relevant,
- sill and head level/height,
- finish,
- fire/acoustic/security/performance information,
- louvre information,
- explicit location/level mapping.
Use elevations/sections especially for sill/head and grouped/corner windows where plan alone is insufficient.

## Reconciliation and host relationship
- Reconcile plan count by mark with schedule count as a QA check only.
- Bind to production Walls when possible.
- Width/height feed deterministic wall opening deductions.
- Partial-height wall-finish deductions around windows require vertical overlap evidence; do not guess sill/head effects.

## BOQ derivation
Window geometry is not a generic opening-area BOQ line. Derive schedule-defined window sets, frames, glazing, sills/boards and associated components only when evidence supports them.

## Completeness audit
Sweep every external façade, courtyard/core edge and internal windowed partition. Check small toilet windows, high-level windows, corner units, continuous glazing and windows obscured by dimensions/hatching. Count each physical scheduled instance exactly once.
