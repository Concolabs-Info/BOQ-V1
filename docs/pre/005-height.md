# 005 — Height

Model call 2, height half. Put a floor-to-floor height on every storey, read off an
elevation or section.

## In / out

```
IN   the storey stack (003)
     user-selected section/elevation source viewport(s) with CONFIRMED scale (004)
OUT  height_mm and source evidence on each storey row
     HUMAN drags a line, confirms the whole stack at once   -> screen Height
```

Height starts with a human source selection. It never chooses a drawing or asks the model
to browse for one. Height needs a confirmed scale on every selected source. It does **not**
need Slab, and Slab does not need it (`open-questions.md` 27, answered — slab thickness
comes from the slab's own top and bottom).

## Source selection — no model call

The Height screen lists every eligible source candidate:

```
included sheet + relevant viewport + kind in (section, elevation) + confirmed current scale
```

Each row shows a thumbnail, sheet number, viewport title, kind, and scale status. Clicking
a row opens its full 150-DPI crop so the user can inspect level lines and printed heights
before choosing it.

The user selects exactly one **primary** source and may select one optional **supporting**
source. Sections appear first because they commonly show floor lines most clearly, but
nothing is preselected. The primary source produces the height proposal. The supporting
source is quiet cross-check evidence only; do not automatically merge its bands into the
primary result.

## Schema

```python
class StoreyBand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str | None       # "GROUND FLOOR", "FIRST FLOOR", or null
    height_text: str | None # the printed height, verbatim: "13'", "11'-6\"", or null
    y_top: int              # norm_1000 within the crop
    y_bottom: int

    @model_validator(mode="after")
    def ordered(self):
        if self.y_bottom <= self.y_top:
            raise ValueError("y_bottom must be below y_top")
        return self


class HeightReading(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bands: list[StoreyBand]
```

The server attaches the selected `source_viewport_id` to each reading; the model does not
invent an identifier. A persisted height records `height_source_viewport_id`, `height_y_top`,
`height_y_bottom`, and its basis (`printed_and_measured`, `measured`, or `user_adjusted`).


## Prompt

```python
HEIGHT_PROMPT = """\
This image is the user-selected {source_kind} source for a building's storey heights.

Expected storeys, bottom to top:
{storey_stack}

Find every STOREY BAND - the vertical space between one floor level and the next. Working \
from the top of the drawing downwards, report for each:

- "y_top" and "y_bottom": the y of the two floor lines that bound the band.
- "label": the storey name printed on or beside it, exactly as printed, or null.
- "height_text": the floor-to-floor height printed for that band, exactly as printed, \
including feet and inch marks. "13'", "11'", "11'-6\\"". Null if none is printed.

Report bands in the order they appear, top to bottom. Include every band you can see, \
including a basement or a parapet band. The expected storey list is context for matching; \
do not invent a band that is not visible.

Do not compute a height. Do not convert units. Report only the printed text and the two \
lines you measured between.

Coordinates are 0-1000 across this image, origin top-left, y down.
"""
```

Same `SYSTEM` as 002 and 004.

## Two independent sources, cross-checked

This is what makes the stage trustworthy. Each band gives a height twice.

```python
measured_mm = (y_bottom - y_top) -> page pt -> * 25.4/72 * factor
printed_mm  = parse_length_mm(height_text)          # reused from 004
```

```
agree within 1%   -> accept, status ready
disagree          -> flag, show both, human decides
printed is null   -> use measured, mark basis="measured"
```

Rounding is NRM2 §3.2.1 — nearest 10 mm, applied **after** conversion:

```
13'      -> 3962.4 mm -> 3960 mm
11'      -> 3352.8 mm -> 3350 mm
11'-6"   -> 3505.2 mm -> 3510 mm
```

Rounding in feet first throws away precision the rule exists to preserve
(`docs/00-architecture.md` §2.2).

## Matching bands to storeys

Bands come top-to-bottom. The stack from 003 is bottom-to-top. Reverse one, then match on
`label` where present, and by position where not. Where counts differ, leave unmatched
storeys unresolved and ask — a silently misaligned stack puts every storey's height on the
wrong floor.

When a supporting source exists, calculate its bands separately and compare only matching
storeys. A small within-tolerance difference is retained in evidence but is not a prominent
decision. A disagreement beyond 1%, or a contradiction with printed height text, is flagged
for the user. Never fill a missing primary band automatically from the supporting source.

## Human actions

```
GET  /projects/{id}/height-candidates  eligible sources + thumbnails and crop links
POST /projects/{id}/heights/suggest    run one call per selected source
                                      body: primary_viewport_id, supporting_viewport_id?
PUT  /storeys/{id}/height              a dragged line, or a typed value
POST /confirmations                    confirm the WHOLE stack, once
```

**The stack confirms as one action, not one storey at a time** (`open-questions.md` 22,
answered: *"you can simply use the elevation view and confirm all the heights at once"*).

Dragging a band line updates the height live from the confirmed scale. Reuse the
`CalibrationCanvas` gesture rotated to horizontal lines.

## Files

```
core/height.py         HEIGHT_PROMPT, HeightReading, eligible_sources, measure_bands,
                       match_to_stack, compare_supporting_source
api/routes/heights.py  candidates, suggest, set, confirm
```

`parse_length_mm` is imported from `core/scale.py`. One parser, used by both stages.

## Tests

Against page 13 of the sample, where the heights are printed.


| Test                            | Expects                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `test_bands_found`              | ground, typical and terrace bands located                             |
| `test_printed_heights`          | `13'`, `11'`, `11'-6"` read verbatim                                  |
| `test_convert_and_round`        | `13'` → 3960 mm, `11'` → 3350 mm, `11'-6"` → 3510 mm                  |
| `test_round_after_convert`      | rounding in feet first is measurably different, and is not what we do |
| `test_cross_check_agrees`       | measured and printed within 1% on the sample                          |
| `test_disagreement_flags`       | a 5% mismatch flags rather than picking one                           |
| `test_band_count_mismatch`      | 4 bands against 5 storeys asks instead of guessing                    |
| `test_requires_confirmed_scale` | an unscaled viewport refuses the stage                                |
| `test_candidates_are_eligible`  | only included, relevant, confirmed-scale sections/elevations appear   |
| `test_primary_source_required`  | suggest refuses zero or more than one primary source                  |
| `test_supporting_not_merged`    | a missing primary band stays unresolved, not silently filled          |




## Done when

The user selects Sectional Elevation B-B as primary, page 13 yields Ground 3960, typical
3350, terrace 3510 mm, printed and measured agree, and the whole stack confirms in one
action.
