# Roof Detection — Production Method

## 1. Use Pre outputs first

Do not start Roof by scanning the whole PDF.

Pre/Gemini has already identified possible Roof inputs. Load only those records.

For each roof scope, choose one primary plan/crop. Examples:

- Main Roof Plan
- Roof Terrace Plan
- Upper Roof Plan
- Canopy Plan
- floor-plan crop that contains a lower roof

Attach other evidence only when useful.

## 2. Decide whether vertical evidence is needed

### Flat and clear
If the plan clearly shows a flat roof and enough levels/falls/material evidence exists, use the plan only.

### Pitched or vertically unclear
Use stored Pre evidence for:

- section pitch
- roof profile
- levels
- roof steps
- abutment conditions

Prefer structured facts already extracted in Pre. Send a section/elevation image to OpenAI only if the structured evidence is insufficient.

## 3. Cheap pre-processing before OpenAI

For the selected crop, extract or reuse:

- text and bounding boxes
- roof codes
- pitch/fall values
- level values
- roof labels
- section/detail references
- scale evidence
- vector polylines/closed shapes where reliable
- hatch/colour regions where reliable

This context helps the model but does not replace the drawing image.

## 4. Build one primary OpenAI request

The normal request contains:

- one primary roof image/crop
- exact image width/height
- structured text/evidence context
- known level/scope
- useful Pre section facts if relevant
- strict model instructions
- strict JSON schema

The model should detect all roof geometry in one response:

- regions
- planes
- edges
- openings
- drainage evidence
- visible material codes
- pitch/slope evidence
- review items

Do not make separate calls for ridge, hip, valley, pitch and openings.

## 5. Validate immediately

Run deterministic checks before saving as accepted candidate geometry.

Validation includes:

- all points inside image
- minimum polygon size
- closed conceptual polygons
- no self-intersection
- no duplicate vertices
- no impossible overlaps
- plane union reasonably reconstructs the host RoofRegion
- opening belongs to a host plane/region
- internal edges touch expected planes
- pitch values are plausible and supported
- non-roof areas are not obvious false positives

## 6. Repair policy

If validation fails:

1. Identify the exact failed region/edge/opening.
2. Crop a small context area around it.
3. Send one targeted repair request with the existing accepted context.
4. Merge only the repaired result.

Do not resend the whole roof unless the whole result is unusable.

Automatic call limit:

```text
Attempt 1 = full roof detection
Attempt 2 = targeted repair
Then = Needs Review
```

## 7. Save candidates

Persist raw AI output and normalized Candidate objects separately.

Never overwrite the source response when the user edits geometry.

Recommended states:

- detected
- validated
- needs_review
- user_edited
- confirmed
- superseded

## 8. Convert to measured objects

After geometry is valid:

- apply scale
- calculate plan area
- calculate actual surface area
- calculate edge lengths
- calculate opening/deduct areas under the selected measurement rules
- resolve roof system/build-up

The measured object is what feeds Workbook/BOQ.

## 9. Cache

No repeated analysis when the source has not changed.

Cache on:

- source hash
- crop hash/coordinates
- prompt version
- model settings
- context hash

A new source revision creates a new analysis version rather than mutating the old one.
