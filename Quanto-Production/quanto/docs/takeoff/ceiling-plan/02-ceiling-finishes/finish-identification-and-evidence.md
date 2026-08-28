# Ceiling Finishes — Identification and Evidence Resolution

This file defines how to build finish definitions and decide which finish applies to each CeilingZone.

## 1. Build the project finish library first

Search all relevant sources for ceiling finish definitions.

### Ceiling schedule

Extract fields such as:

- finish code;
- ceiling system/type;
- material;
- board/tile/panel type;
- size/module;
- thickness if given;
- suspension/grid system if given;
- exposed soffit treatment;
- paint/coating;
- acoustic/fire/moisture notes when explicitly stated;
- detail/specification reference;
- revision/source.

### Room finish schedule

Common columns:

```text
Room | Floor | Wall | Ceiling | Skirting | Notes
```

Extract the Ceiling column and room identifier/name.

### Finish/material schedule

Some projects put floor/wall/ceiling finishes in one generic schedule. Determine which entries actually relate to ceilings.

### Legend

Extract relationships such as:

```text
Blue fill → C03
Diagonal hatch → C05
```

A legend can map directly to a material instead of a code.

### Specification/general notes

Convert relevant prose into structured rules.

Examples:

```text
All bedrooms → C01
All wet areas → moisture-resistant plasterboard ceiling
All exposed concrete soffits → paint system P04
Unless otherwise noted all internal ceilings → C02
```

Keep:

- rule scope;
- inclusions/exclusions;
- source section/page;
- revision;
- confidence.

## 2. Collect zone evidence

For every CeilingZone, collect evidence from:

- direct tag/code;
- direct material text;
- colour/hatch;
- linked room IDs;
- room name/type;
- room-specific schedule entry;
- finish/ceiling schedule;
- specification rules;
- detail/keynote references;
- explicit user override.

## 3. Resolve using evidence, not a fixed word list

Typical strength order:

1. confirmed user override;
2. explicit zone code/material note on current-revision drawing;
3. explicit room/zone schedule assignment;
4. colour/hatch with an unambiguous legend;
5. exact room-name/ID schedule rule;
6. specification rule for that exact room/category;
7. normalized room-type rule;
8. project default/general note.

Do not treat this as a blind score. Revision status, source authority and explicit override notes matter.

## 4. Example — direct code

```text
RCP zone: C03
        ↓
Ceiling schedule: C03 = acoustic tile in exposed grid
        ↓
CeilingFinishAssignment(zone, C03)
```

## 5. Example — colour legend

```text
Zone fill = blue
Legend: blue = C02
Schedule: C02 = gypsum board suspended ceiling
```

Store all three links.

## 6. Example — room schedule

```text
Room: Bedroom 01
Room finish schedule: Bedroom 01 ceiling = C01
```

Link the zone through its `floor_space_id`.

## 7. Example — room-type specification rule

```text
No code on plan
No room schedule
Specification: all bathrooms receive moisture-resistant plasterboard ceiling
Room normalized_type = bathroom
```

Apply the rule with lower/appropriate confidence and keep the specification evidence.

## 8. Exceptions

General rules can be overridden.

Example:

```text
General: all bedrooms = C01
Bedroom 03 plan tag = C04
```

The explicit current drawing tag normally wins. Keep the general rule as overridden evidence.

## 9. Conflicts

Example:

```text
RCP = C02
Room finish schedule = C03
Both same revision/status and no precedence rule
```

Create a `CeilingFinishConflict`/question.

Do not silently select one.

## 10. Missing definition

If the plan says `C07` but no schedule/specification defines `C07`:

- keep the assignment candidate to `C07`;
- mark the definition as unresolved;
- search all relevant sources again;
- ask the user if still missing;
- do not invent a material description.

## 11. Multiple finish layers

A ceiling system can produce multiple BOQ-related descriptions, for example:

- suspended board/system;
- skim/plaster finish;
- paint/coating.

Do not flatten this too early.

The `CeilingFinishDefinition` can contain layers/components, and the measurement/BOQ rule service decides how they become measured work lines.

## 12. Finish changes inside one room

If evidence clearly shows two finishes in one room, geometry must support two zones.

Do not attach two mutually exclusive finishes to the exact same full-room polygon unless they are true layers of one system.

## 13. Traceability

Every final assignment should answer:

- What zone is this?
- What finish was assigned?
- Which code/rule caused the assignment?
- Where was that code/rule defined?
- Which revision did it come from?
- Was it confirmed by the user?
