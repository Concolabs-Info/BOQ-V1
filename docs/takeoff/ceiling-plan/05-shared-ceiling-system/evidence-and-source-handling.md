# Shared Ceiling System — Evidence and Source Handling

Ceiling accuracy depends on combining multiple drawings without losing where each fact came from.

## 1. Evidence is first-class data

Every important result should point back to an `EvidenceRef`.

Examples:

- room polygon reused from Floor;
- RCP code `C03`;
- blue fill region;
- legend saying blue = C03;
- schedule defining C03;
- specification saying bathrooms use moisture-resistant board;
- section showing ceiling slopes from 2700 to 3600;
- user correction.

## 2. Source kinds

At minimum support:

- floor plan;
- RCP/ceiling plan;
- section;
- Pre section observation;
- elevation;
- detail;
- room finish schedule;
- ceiling schedule;
- finish/material schedule;
- legend;
- specification;
- general notes;
- user input.

## 3. Source binding per level

Create a `CeilingSourceBinding` that says which sources apply to one FloorLevel or typical-level group.

This prevents a ceiling schedule from one building/level being applied to the wrong plan.

## 3A. Pre section observations

Pre may already have analysed a section enough to produce reusable vertical/special-geometry evidence. Ceiling should reference that observation instead of copying it as an untraceable new fact.

A reusable observation should preserve:

- section ID/name;
- page ID and crop/bbox;
- source revision;
- observation type (`sloped_ceiling`, `bulkhead`, `double_height`, `stair_soffit`, etc.);
- visible levels/dimensions/notes;
- local bbox/geometry in the section crop where useful;
- confidence;
- the model/prompt/schema version that produced it, when AI was used.

Ceiling then creates a relationship such as:

```text
PreSectionObservation OBS-42
        ↓ supports
CeilingZone CZ-L01-008
        ↓ creates
SpecialCeilingGeometry SCG-008
```

If Ceiling performs a targeted re-analysis, keep both the original Pre observation and the new evidence so the result remains auditable.

---

## 4. Pre-extracted text

Text extraction should preserve:

- exact raw text;
- page ID;
- bbox/anchor coordinates;
- font/rotation if useful;
- extraction confidence;
- source revision.

Do not send only a list of strings to the model. Coordinates matter.

## 5. Vector/colour/hatch hints

Keep these as candidates.

Examples:

- closed polygon at RCP location;
- RGB/CMYK fill value;
- hatch line-angle signature;
- grid module pattern.

A model/rule layer decides whether the candidate actually represents a ceiling zone/finish.

## 6. Revision handling

Evidence must carry drawing revision/status where available.

If a later revision changes a code or zone:

- invalidate affected candidates/measurements;
- preserve history;
- do not silently delete user-confirmed corrections.

## 7. Typical-floor handling

When one RCP/finish schedule applies to repeated floors:

- store the shared source once;
- create level-specific instances;
- keep instance overrides separately;
- recalculate quantities per level.

## 8. Evidence precedence

Do not hard-code one global source ranking for every project.

Use:

- explicit project rules;
- current revision;
- directness/specificity;
- source authority;
- user confirmation.

General specification text should not silently override a direct room-specific drawing tag.

## 9. Conflicts

Create explicit conflicts for:

- RCP code vs schedule room assignment;
- RCP level vs section level;
- two schedule definitions for one code;
- specification exception vs general rule;
- user-confirmed geometry vs new AI result.

## 10. Questions

Two useful types:

### Anomaly question

Something conflicts or appears wrong.

Example: `RCP says C02 but current room finish schedule says C03. Which should be used?`

### Guidance question

The drawings simply do not provide enough information.

Example: `This ceiling is marked raked but no level/angle is shown. Please provide/confirm the slope.`

## 11. Never hide uncertainty

A complete-looking BOQ with invented ceiling assumptions is worse than a visible unresolved question.
