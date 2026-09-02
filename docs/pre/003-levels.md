# 003 — Levels

Build the storey stack from the level labels triage transcribed. No model call.
Pure code plus a human confirm.

## In / out

```
IN   plan viewports with level_label (from 002)
OUT  storey rows: name, level_index, typical_group
     HUMAN confirms the order, names storeys, marks typical groups
```

Heights are **not** set here — that is 005. This stage decides only what the storeys are
and what order they sit in.

## Why it is a stage at all

Every instance gets its level from the viewport it was found on. That only works if the
stack exists and is ordered. It also has to exist independently of the viewports:
`demo-ui-plan/takeoff/walls/dimension.md` says a level may have no plan at all —
*"Ground — open first. Empty is allowed. Missing, not hidden."*

So the stack is a project-level object seeded from viewports, not derived from them.

## Ordering

A small lookup, applied to the transcribed label, then the user fixes whatever it got wrong.

```python
RANK = {
    "basement": -1, "lower ground": -1,
    "ground": 0, "gf": 0, "level 0": 0,
    "first": 1, "second": 2, "third": 3, "fourth": 4,
    "fifth": 5, "sixth": 6, "seventh": 7,
    "terrace": 90, "roof terrace": 90, "roof": 95,
    "upper roof": 96, "machine room": 97, "water tank": 97,
}

def rank(label: str) -> int | None:
    key = " ".join(label.lower().replace("_", " ").split())
    for token, value in RANK.items():
        if token in key:
            return value
    return None            # unknown -> the user places it
```

A label that matches nothing gets `None` and lands at the end, flagged. That is honest;
guessing an index is not. The table covers this drawing set and grows only when a real
label misses.

**This is not a drawing convention.** Storey naming is a property of the English language
and the building, not of the CAD standard, so a lookup is safe here in a way that a layer
name never would be.

## Typical groups

The label carries it. Page 19 of the sample reads
`02 BED ROOM APARTMENT - TYPICAL FLOOR PLAN`, and page 13 shows `11'` about fifty times.

```
if "typical" in label.lower():  mark the storey as belonging to a typical group
```

The **range** ("2nd–6th") is not inferred. `docs/00-architecture.md` §2.3 records that
typical grouping is stated on the page, so the user sets the range and confirms it. A wrong
range silently multiplies most quantities in the bill.

## Algorithm

```
1  read included viewports where view_kind = plan and level_label is not null
2  rank each level_label; sort; unknown labels to the end
3  insert storey rows: name = the transcribed label, level_index = position
4  mark typical candidates
5  return the stack for confirmation
```



## Human actions

```
POST  /projects/{id}/storeys/reorder     drag to reorder
PATCH /storeys/{id}                      rename, set typical_group range
POST  /storeys                           add a storey with no plan
POST  /confirmations                     confirm the stack, once
```

The stack confirms as a whole, not one storey at a time. Same rule as height
(`open-questions.md` 22).

## Files

```
core/levels.py            RANK, rank(), build_stack()
api/routes/storeys.py     reorder, patch, create
```



## Done when

The sample set produces an ordered stack, the typical group is flagged but its range is
unset until a human sets it, and a storey can exist with no plan behind it.
