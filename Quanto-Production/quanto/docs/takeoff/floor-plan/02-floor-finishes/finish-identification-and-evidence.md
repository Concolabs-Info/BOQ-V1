# Floor Finishes — Identification and Evidence Resolution

This file explains how Quanto resolves finishes when drawings use different methods such as direct text, finish codes, room codes, colours, hatches, legends, schedules, specifications or room-type rules. The drawing format may change; the evidence model stays stable.


## Source extraction

## PURPOSE

Convert many document styles into one common evidence format.

## A. FINISH SCHEDULE EXTRACTOR

Table/model extraction should identify semantic columns, not fixed indexes. Possible headings:

- Mark / Code / Ref;
- Floor Finish / Flooring / Floor;
- Description / Material;
- Size / Module;
- Thickness;
- Bedding / Adhesive / Backing;
- Screed / Base;
- Skirting / Base;
- Location / Room;
- Notes / Specification ref.

A schedule may contain wall and ceiling finishes in nearby columns. The extractor must keep the
floor column context.

## B. ROOM FINISH SCHEDULE

Create assignments such as:

```text
Room 101 -> F01
Bathroom Type A -> F05
All bedrooms Level 2-6 -> F02
```

Store scope exactly. Do not apply `Level 2-6` to Ground.

## C. COLOUR LEGEND

Extract each legend swatch and its meaning:

```text
signature C_BLUE_01
  -> mark F05
  -> text "Anti-slip tile"
```

Then compare plan regions to the swatch. Keep colour distance/confidence. A blue region with no
legend mapping is only visual evidence, not a finish assignment.

## D. HATCH/PATTERN LEGEND

Same as colour. Build a project-local signature. Do not assume ANSI/conventional hatch meaning.

## E. SPECIFICATION

Extract **rules**, not only material names. Examples:

```text
scope: all bathrooms
finish: F05 / anti-slip porcelain tile
exceptions: staff WC uses F08
source clause: ...
```

Possible scopes:

- exact room name/number;
- normalized room type;
- unit type;
- floor/level range;
- internal/external area;
- named zone;
- all areas unless noted otherwise.

## F. GENERAL NOTES / KEYNOTES / DETAILS

Convert into the same evidence structure with scope and authority. A detail tied by a keynote may
be stronger than a generic specification default.

## COMMON OUTPUT

Every adapter outputs proposed facts like:

```text
EvidenceFact
  fact_type
  value
  scope
  source_ref
  raw_text / swatch / bbox
  confidence
  extractor_version
```

The assignment resolver consumes these facts; adapters do not directly update rooms.


## Evidence resolution and priority

## PURPOSE

Choose the most defensible finish for each FinishZone/FloorSpace while keeping conflicts visible.

## RESOLUTION ORDER

Use this as the default authority order, with project-specific bindings able to refine it:

1. user-confirmed assignment;
2. exact room/space finish schedule row;
3. explicit finish mark/tag physically inside or leader-linked to the zone;
4. explicit bounded material note/detail tied to the zone;
5. specification/detail rule tied to exact room(s)/level(s);
6. legend-backed colour/hatch region;
7. room-type rule explicitly stated in a schedule/specification;
8. stated general default such as “unless noted otherwise”;
9. model suggestion only;
10. unresolved.

A lower source cannot silently overwrite a higher source.

## RESOLUTION EXAMPLES

### Code path

```text
Bedroom 01 polygon
  -> plan tag F02
  -> FinishDefinition F02 from schedule
  -> resolved F02
```

### Colour path

```text
Zone matches blue swatch
  -> legend says blue = F05
  -> schedule says F05 = anti-slip porcelain tile
  -> resolved F05
```

### Room schedule path

```text
Room raw label "BED 03"
  -> exact room schedule row "BED 03 = F02"
  -> resolved F02
```

### Room-type specification path

```text
Room normalized_type = bathroom
  -> specification explicit: all bathrooms = F05
  -> resolved F05 unless a higher specific override exists
```

### Conflict

```text
plan tag F03
room schedule says F05
same revision/scope, both explicit
-> anomaly question; no silent winner
```

## FINISH TRANSITIONS AT DOORS

When adjacent rooms have different finishes:

- use threshold/transition detail if supplied;
- use explicit plan boundary if drawn;
- use a stated project convention if evidence exists;
- otherwise keep ConnectorFloorRegion unresolved and ask where the transition occurs.

## CONFIDENCE

Confidence should reflect evidence agreement, not model self-confidence alone. Direct tag +
matching schedule + matching legend can be high confidence. Room-type guess with no project rule
must stay low and unresolved.


## Machine strategy

## PURPOSE

Implement finish extraction without making one giant AI call solve the whole package.

## FLOW

```text
A. Build definitions
   schedule adapters
   legend adapters
   specification/keynote adapters
   -> FinishDefinition candidates
   -> reconcile library

B. Build spatial evidence
   plan text tags
   colour/hatch signatures
   direct material notes
   room/zone relationships
   -> FinishZone candidates/evidence

C. Resolve
   deterministic evidence precedence/scope resolver
   -> assignment / conflict / unresolved

D. Measure
   validated geometry + rule engine
   -> MeasuredWorkObjects
```

## AI USE

Use models for:

- understanding unusual table/legend layouts;
- turning specification prose into scoped structured rules;
- associating ambiguous leaders/tags with plan zones;
- deciding whether a visual region is a real finish boundary;
- targeted review of conflicts.

Do not use models for:

- official area calculation;
- NRM deduction arithmetic;
- final BOQ grouping;
- guessing a finish because it is common for that room type.

## DYNAMIC PROJECT VOCABULARY

Before plan search, discover known finish marks/names from project sources. This gives the plan
extractor a project-local vocabulary and improves recall without hardcoding conventions.

## REGISTRATION

If finish information is on a secondary plan, transform it into the architectural source/world
coordinate system only after registration validation. Keep the original source geometry/evidence
too.

## INCREMENTAL RERUNS

- changed finish schedule -> rebuild definitions + affected assignments only;
- changed colour legend -> rerun colour mapping, not floor detection;
- edited room polygon -> revalidate dependent finish zone geometry/quantity;
- new user finish type -> add definition without AI rerun.


## Validation and conflicts

## COVERAGE CHECKS

For every accepted physical floor surface that is in Floor scope:

- it has one final finish assignment;
- or it has multiple non-overlapping FinishZones covering it;
- or it is explicitly `no_finish` with evidence;
- or it is unresolved and visible as a question.

Never silently leave a surface unclassified.

## GEOMETRY CHECKS

- finish zones stay inside/legitimately intersect their host surface;
- peer finish zones do not materially overlap;
- finish boundaries do not cross walls without evidence;
- colour/hatch segmentation is cleaned only within stated tolerances;
- connector strips are not lost/double counted;
- non-floor regions are not accidentally assigned a finish.

## EVIDENCE CHECKS

- every resolved FinishDefinition has source evidence or is user-created;
- every automatic assignment stores the evidence path;
- scope matches floor/room/unit/revision;
- schedule mark exists in the library;
- direct mark text is actually near/linked to the target zone;
- colour/hatch meaning is legend-backed;
- general defaults do not override specific exceptions.

## QUANTITY CHECKS

- model-reported area, if any slips through, is ignored;
- code area reconciles against printed area/dimensions where available;
- NRM small-void and width rules are applied by rules, not by deleting geometry.
