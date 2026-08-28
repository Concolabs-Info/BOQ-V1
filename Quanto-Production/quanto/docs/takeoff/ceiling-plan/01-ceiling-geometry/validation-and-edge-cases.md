# Ceiling Geometry — Validation and Edge Cases

This file is the checklist for cases the detector and validator must handle. The model instructions mention them, but code validation is still required.

## 1. Normal flat room

**Expected:** ceiling footprint normally equals the confirmed room polygon.

If no ceiling-specific evidence exists, reuse the room polygon.

## 2. Door openings

Unlike floor finishes, there is normally no separate "door threshold ceiling strip" to add.

A doorway does not usually split a ceiling unless the drawings show a ceiling-zone change, bulkhead, beam/soffit or different ceiling level across the opening.

## 3. Open-plan rooms

Living/dining/kitchen labels may exist inside one open physical space.

Do not create separate ceiling polygons only because the functional labels differ.

Split only when ceiling evidence changes, for example:

- different ceiling code;
- dropped kitchen ceiling;
- ceiling island;
- different level;
- different finish.

## 4. Open to sky

Examples:

- courtyard;
- terrace with no overhead structure;
- light well;
- atrium opening.

Floor area may exist, but ceiling quantity is zero at that level unless an actual soffit/cover exists.

Evidence can include:

- `OPEN TO SKY`;
- roof/section evidence;
- missing overhead slab/roof;
- architectural notes.

Represent this explicitly as a `no_ceiling`/exclusion condition so it is not forgotten later.

## 5. Open to below / void / atrium

A void can mean different things depending on the level.

At the lower level there may be a floor and a high ceiling above.
At the upper level there may be no floor but the ceiling could still be at a higher roof/slab.

Do not infer ceiling ownership from the word `VOID` alone. Check level relationships and section evidence.

## 6. Double-height rooms

A double-height room normally has one ceiling at a higher level.

Do not create a normal ceiling at the intermediate floor level if there is no ceiling surface there.

Save:

- lower room/space relationship;
- actual ceiling level;
- supporting section/elevation evidence.

## 7. Staircases

Possible conditions:

- open stair void with no ceiling at one level;
- flat soffit under a landing;
- sloping stair soffit;
- stepped soffit;
- normal ceiling above the stair hall at higher level.

Use floor plan + stair geometry + section/detail.

Do not assume the stair footprint equals ceiling area.

## 8. Sloped/raked ceiling

Identify from:

- slope arrow;
- `RAKED`, `SLOPING`, `VAULTED` note;
- ceiling high/low levels;
- section/elevation;
- roof underside relationship.

The plan polygon is only the horizontal footprint. Actual finish area must be calculated from slope geometry.

## 9. Vaulted / multi-plane ceiling

One room may contain two or more sloping planes.

The detector should return separate planes or enough ridge/valley/high-point information for code to construct them.

Do not measure the horizontal footprint as the final finish area.

## 10. Dropped/stepped ceiling

A room can contain several flat zones at different levels.

Split the plan into zones when the boundary is real and measurable.

Also identify vertical transition faces if they are part of the finish scope.

## 11. Bulkheads

A bulkhead may be shown by:

- double lines;
- dashed outline;
- dimensioned drop;
- ceiling-level change;
- note/detail reference.

Do not treat every rectangular line on an RCP as a bulkhead because lights/grids can look similar.

## 12. Ceiling islands

A suspended island may cover only part of a room.

Return the island polygon separately and preserve the base ceiling/soffit condition around it.

## 13. Exposed slab soffit

This is still a ceiling/soffit finish zone if it receives paint/coating/finish.

Do not interpret "no suspended ceiling" as "no measurable ceiling finish".

## 14. External balcony/verandah/canopy soffit

An external floor area below does not automatically mean there is a soffit above.

Check whether there is an overhead slab/roof/canopy.

If yes, create an external `SoffitZone` or CeilingZone with environment `external`/`semi_external`.

## 15. Shafts and risers

A shaft opening may have no ceiling at the opening itself, but surrounding shaft walls/soffits can have separate finishes.

Only measure surfaces explicitly within Ceiling scope.

## 16. Lift lobby / lift shaft

The lobby normally has a ceiling. The lift shaft opening does not become a lobby ceiling polygon.

Use room/shaft geometry to avoid covering the shaft opening incorrectly.

## 17. Beams crossing ceilings

A downstand beam can create:

- ceiling/soffit underside;
- vertical beam sides;
- split ceiling zones;

Do not automatically include beam sides in ceiling finish unless the project measurement scope says to.

If the beam affects finish or geometry, keep it as evidence/special object.

## 18. Columns

Columns normally do not create a separate ceiling zone by themselves.

Small column penetrations/deductions should be handled by the configured measurement rules, not by making arbitrary holes during AI detection.

## 19. Ceiling fixtures

Lights, diffusers, grilles, speakers, sprinklers and access panels can appear heavily on RCPs.

They help identify the drawing but should not be mistaken for ceiling boundaries.

Whether openings are deducted from measured ceiling area depends on the configured measurement standard and size thresholds.

## 20. Different ceiling type within one room

Split into separate CeilingZones or FinishZones.

Example:

```text
Bathroom
  zone A = moisture-resistant gypsum board
  zone B = exposed soffit above shower void
```

## 21. Same ceiling across several room labels

If an open-plan ceiling is physically continuous and carries one finish, it can be one CeilingZone linked to several FloorSpaces.

## 22. Curved ceilings

If encountered, do not pretend a 2D polygon is enough.

Require:

- radius/profile/detail information; or
- user input;
- then calculate surface area deterministically.

Low-confidence curved geometry should be sent to review.

## 23. Typical/repeated levels

If drawings state a typical ceiling plan applies to several floors, store one source definition and instantiate it against each linked FloorLevel.

Do not multiply blindly if later revisions or floor-specific notes differ.

## 24. Missing scale

Geometry may be detected in pixels, but no official quantity can be calculated until the viewport has a confirmed world transform/scale.

## 25. Conflicting drawings

If RCP and section disagree on ceiling level/type:

- compare revision/status;
- preserve both evidence refs;
- do not silently overwrite;
- create a question for the user if a reliable precedence rule cannot resolve it.

## 26. User corrections

A confirmed user correction is first-class evidence.

A later model rerun must not silently replace it. It can only suggest a conflict/new revision.
