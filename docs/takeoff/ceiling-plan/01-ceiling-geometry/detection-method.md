# Ceiling Geometry — Detection Method

This file describes the technical flow for creating CeilingZone geometry from drawings and existing Floor data.

## 1. Bind the correct sources

Pre should already classify pages. Ceiling receives likely sources such as:

- reflected ceiling plan;
- ceiling plan;
- floor plan;
- section/elevation;
- ceiling/room finish schedule;
- specification;
- architectural details.

Create a `CeilingSourceBinding` for each level.

The binding says:

- which floor level is being analysed;
- which FloorSpace set is current;
- which page/crop is the main ceiling coordinate source;
- which sections/details support special geometry;
- which schedules/specifications support finish assignment.

## 1A. Read reusable section evidence from Pre first

Before Ceiling sends any section to a model, load the section inventory/observations already produced by Pre.

Each saved section can contain:

- section ID and page ID;
- section-view bbox/crop reference;
- section cut/callout reference where available;
- related floor levels;
- ceiling/soffit levels;
- sloped/raked/vaulted ceiling observations;
- bulkhead/drop observations;
- double-height/open-to-below observations;
- stair soffit observations;
- relevant dimensions/notes/detail references;
- evidence confidence.

Ceiling should first try to link these observations to the current floor/rooms by section ID, section cut position, level, room labels and spatial context.

Do **not** rerun a section model call just to rediscover information that Pre has already stored with good evidence.

Run a targeted section analysis only when:

- Pre found the section crop but did not extract the needed ceiling fact;
- the observation cannot be mapped to the correct room/zone;
- high/low levels or drop depth are missing;
- evidence conflicts with the RCP/floor plan;
- the user requests re-analysis.

The targeted call receives the saved section crop plus existing Floor/Ceiling context and returns only the missing vertical/special-ceiling information.

---

## 2. Pre-extract deterministic context

Before the model call, code should extract what it can from the PDF:

### Text with coordinates

Extract:

- room labels;
- ceiling tags such as `C01`, `CL02`, `CT-3`;
- ceiling-level text;
- `AFFL`, `FCL`, `CL`, `U/S`, `SOFFIT` text;
- `OPEN TO SKY`, `VOID`, `OPEN TO BELOW`, `DOUBLE HEIGHT`;
- `RCP`, `REFLECTED CEILING PLAN`;
- material notes;
- detail/section callouts.

Save the text bbox or anchor point in source coordinates.

### Vector evidence

When available, extract:

- closed polylines;
- ceiling grid lines;
- local boundary lines;
- fill colours;
- hatch/pattern signatures;
- arrows;
- leaders.

These are hints, not final truth. RCP linework can include lights, grids and MEP symbols that should not become ceiling boundaries.

### Existing room context

Provide the model with:

- FloorLevel ID/name;
- FloorSpace ID;
- raw room label;
- normalized room type;
- room polygon in the same/aligned coordinate system when possible;
- room area as a check only, not a target to copy.

## 3. Decide whether a model geometry call is needed

### No RCP and no special geometry evidence

Do not spend a heavy model call redetecting the room.

Create a default zone from the confirmed FloorSpace polygon and continue to finish resolution.

### No RCP but special ceiling evidence exists

First use the reusable section/detail observations already stored by Pre. If they are enough, create the special ceiling candidate without another model call.

Only when the stored evidence is incomplete or ambiguous, use a targeted model call with the saved section/detail crop to identify the missing special condition.

### RCP exists

Run the ceiling geometry model on the RCP with the pre-extracted context and room references.

## 4. Detect zone boundaries

The model should reason in passes:

### Pass A — coverage

Identify where a ceiling/soffit exists and where it clearly does not.

### Pass B — zone changes

Look for evidence of changes in:

- ceiling type;
- finish code;
- ceiling level;
- slope;
- material;
- suspended vs exposed soffit;
- bulkhead/dropped ceiling boundary.

### Pass C — room relationships

Link zones to existing FloorSpace IDs using aligned geometry, room labels and spatial overlap.

### Pass D — special geometry

Identify:

- sloped/raked;
- vaulted;
- stepped/dropped;
- double-height;
- partial suspended;
- ceiling island;
- open-to-sky;
- external soffit;
- stair soffit.

### Pass E — evidence

Attach source refs for every important conclusion.

## 5. Alignment when RCP is separate

An RCP may be a separate sheet or a different viewport size.

Do not compare raw pixels directly unless both are from the same coordinate source.

Alignment can use:

- common structural grid points;
- external/internal wall corners;
- column centres;
- stair/lift core;
- drawing dimensions;
- known scale and viewport crop;
- manual control points if automatic alignment is uncertain.

Create a transform from RCP source pixels to world coordinates or floor-plan coordinates.

Store the transform and its confidence.

## 6. Create zone candidates

Convert model output into `CeilingZoneCandidate` objects.

Do not immediately publish to BOQ.

Each candidate should keep:

- raw model output;
- source dimensions;
- evidence;
- source polygon;
- linked room IDs;
- model confidence;
- alignment transform;
- validation results.

## 7. Deterministic validation

Run:

- polygon validity;
- self-intersection check;
- minimum area threshold for obvious noise;
- overlap check;
- coverage comparison against room/ceiling envelope;
- no-ceiling exclusion check;
- room relationship check;
- special-geometry field check;
- source bounds check.

## 8. Targeted repair instead of full rerun

If one zone is uncertain, crop that region and rerun only the relevant check.

Examples:

- "Is this polygon open to sky?"
- "Does C03 continue across this doorway?"
- "Is this line a bulkhead boundary or an MEP/grid line?"
- "Which room does this ceiling-level note apply to?"

This is faster and cheaper than re-analysing the full page.

## 9. User confirmation

Show the result on the canvas.

The user can edit before confirmation.

Confirmed geometry becomes the current CeilingZone revision.

## 10. Measurement

Only after geometry + scale/alignment are accepted:

- flat plan area is calculated from the accepted polygon;
- special surface area is calculated from special geometry;
- perimeter/edge lengths are calculated from accepted geometry;
- no model-provided numeric area is trusted as the official quantity.
