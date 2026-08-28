# Roof Coverings and Build-up — Material and Evidence Resolution

## Why this needs a resolver

Architects do not always describe roof materials in the same way.

Quanto must support different evidence patterns without depending on one schedule format.

## Resolution methods

### 1. Direct roof code

Example:

`R01` written inside the roof plane.

Resolve `R01` against roof schedule/specification.

### 2. Direct material text

Example:

`PROFILED METAL ROOFING`

Create/resolve a roof system directly, then enrich from specification if available.

### 3. Colour-coded roof plan

Example:

- blue roof region
- legend: blue = R03
- schedule: R03 = membrane roof

Store all three evidence links.

### 4. Hatch/pattern legend

Use the same method as colour. Hatch strokes are evidence of type, not geometry boundaries unless the actual zone boundary is clear.

### 5. Area/roof-name rule

Example:

`All canopy roofs: standing seam aluminium.`

Apply to zones classified as canopy roofs unless a stronger direct code overrides it.

### 6. Specification default

Example:

`Unless otherwise noted, flat roofs receive system R04.`

This is a default, lower priority than a direct zone code or specific detail.

### 7. Detail reference

A detail may define build-up for a specific roof type/edge. Link it when the detail callout clearly maps to the zone.

## Suggested evidence priority

Project-specific rules can override this, but a safe default is:

1. user-confirmed assignment
2. direct code/note on the exact roof zone
3. specific detail/schedule row naming that roof
4. colour/hatch legend mapped to the exact zone
5. specification rule for a specific roof type/area
6. general/default specification rule
7. inferred/derived suggestion

## Conflicts

Do not silently resolve two strong conflicting sources.

Create `RoofEvidenceConflict` with:

- zone id
- source A
- value A
- source B
- value B
- recommended action

## Missing information

If geometry is valid but the roof system is unknown:

- keep the geometry
- mark material/build-up `needs_review`
- allow the user to select/create a family

Do not re-run roof geometry AI just because material data is missing.
