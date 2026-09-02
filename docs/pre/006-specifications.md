# 006 — Specifications

Model call 3. Harvest the written information that the drawings depend on but do not draw:
notes, schedules, tables, type keys. Then freeze.

## In / out

```
IN   text-heavy sheets (classification notes/schedule) and note blocks on drawing sheets
OUT  spec_item rows: kind, raw_text, table_json
     HUMAN confirms each item              -> screen Specifications
     then FREEZE -> the Project Frame
```

## Why this call is load-bearing

Concrete grade comes from page notes (`docs/00-architecture.md` §2.3), and grade splits the
concrete bill lines — `Concrete in columns, grade 30` is a different item from
`Concrete in columns, grade 25`. Skip this stage and the BOQ cannot be assembled.

The sample set makes this concrete: pages 1–12 are all specification text, and **page 11 is
literally titled "NRM 2 Measurement Notes"**. The drawings ship with the measurement
intent attached.

Notes are also viewport children, not a separate category (`open-questions.md` 34,
answered). A note on the foundation pile page belongs to that viewport, marked as a note,
and needs no scale.

## Schema

```python
class SpecKind(StrEnum):
    NOTE            = "note"              # prose, tagged by topic
    SCHEDULE        = "schedule"          # door, window, finishes, lintel
    TYPE_KEY        = "type_key"          # "W1 = 230 brick" wall/finish legends
    LEVEL_DATUM     = "level_datum"       # FFL / SSL values
    UNIT_AREA       = "unit_area"


class SpecTable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    columns: list[str]
    rows: list[list[str]]


class SpecItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: SpecKind
    name: str                 # "Concrete grades", "Door schedule"
    topic: str | None         # concrete | masonry | finishes | roofing | ...
    raw_text: str             # verbatim, what was read
    table: SpecTable | None   # only when the source is tabular
    box: Box                  # where on the sheet, norm_1000


class SpecReading(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[SpecItem]
```

## Prompt

```python
SPEC_PROMPT = """\
This image is a construction drawing sheet. Find every block of WRITTEN information on it: \
specification notes, general notes, schedules, tables, legends and type keys.

For each block report:

- "kind": note, schedule, type_key, level_datum or unit_area.
- "name": its heading as printed, or a short description if it has none.
- "topic": what it is about - concrete, masonry, finishes, roofing, doors, windows, \
foundations - or null if it does not fit one topic.
- "raw_text": the text VERBATIM. Preserve numbers, units, grades and codes exactly. Do not \
summarise, do not paraphrase, do not tidy.
- "table": if the block is a table, its column headers and its rows as text. Otherwise \
null. Keep every cell as printed, including blanks.
- "box": where it sits on the sheet.

Read carefully anything that states a MATERIAL GRADE, STRENGTH or MIX - "Grade 25", "C30", \
"1:2:4" - and any THICKNESS or SIZE given in prose. These are the facts the bill is priced \
on. Never round them, never convert them.

Report the title block as a note only if it carries specification content. Sheet numbers \
and drawing titles are not specification.

Coordinates are 0-1000 across this image, origin top-left.
"""
```

Same `SYSTEM` as 002, 004, 005.

## Not-found is a result

A category with no source stays visible as **not found**
(`demo-ui-plan/pre/06-specifications.md`). There is no skip control. A missing door
schedule is a fact the surveyor needs, not an absence to hide.

```
expected = {door_schedule, window_schedule, finishes, concrete_grades, wall_types}
insert a spec_item with found=false for anything the harvest did not produce
```

## Human actions

```
POST /projects/{id}/specs/extract   run call 3 over text sheets
PUT  /spec-items/{id}               edit a cell, retype, confirm
POST /confirmations                 confirm one item
```

Screen shows two tabs per item: **PDF** (the real sheet, region sharp, rest faded) and
**OCR** (the read, with the cleaned table beside it). Reuse
`features/specifications/components/*` from `quanto-demo`.

## Freeze

The last action in Pre. Writes the Project Frame and locks the phase.

```
POST /projects/{id}/pre/freeze
```

Refuses unless every sheet, viewport, scale, storey and spec item is confirmed
(`open-questions.md` 37, answered: Start takeoff cannot be pressed with unconfirmed items).

The frame is what Takeoff reads, and the only thing it reads about the drawings:

```
ProjectFrame
  sheets[]      included only
  viewports[]   bbox_mpt, discipline, view_kind, subjects, level_label, confirmed scale factor
  levels[]      ordered, height_mm, typical_group
  spec_items[]  including found=false entries
  transforms[]  viewport -> page_from_image
```

After freeze, Pre is read-only. Reopening it is an explicit action that invalidates
downstream work — out of scope for v1.

## Files

```
core/specs.py         SPEC_PROMPT, SpecReading, harvest, expected_categories
core/freeze.py        build_frame, validate_all_confirmed
api/routes/specs.py   extract, patch, confirm
api/routes/freeze.py  freeze
```

## Tests

| Test | Expects |
|---|---|
| `test_notes_sheets_harvested` | pages 1–12 yield spec items |
| `test_nrm2_notes_page` | page 11 harvests as a note, topic null or `measurement` |
| `test_finishes_schedule` | page 3 yields a schedule with columns and rows |
| `test_grade_verbatim` | a grade string is preserved exactly, not normalised |
| `test_not_found_recorded` | an absent category appears with `found=false` |
| `test_freeze_blocks_unconfirmed` | freeze with one unconfirmed viewport returns 409 |
| `test_frame_completeness` | the frame carries every included sheet, viewport, storey and spec item |
| `test_frame_excludes_excluded` | an excluded sheet appears nowhere in the frame |

## Done when

Pages 1–12 harvest into confirmable items, a missing category shows as not-found rather
than vanishing, freeze refuses while anything is unconfirmed, and the resulting frame is
sufficient input for Takeoff with no further reference to the PDF.
