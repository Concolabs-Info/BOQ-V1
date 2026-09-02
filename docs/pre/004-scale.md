# 004 — Scale

Model call 2, scale half. The single most dangerous silent failure in the product: a 2%
scale error is a 2% error on every quantity in the bill.

## In / out

```
IN   viewport + its applicable ScaleNote (transcribed, 002) + the 150 DPI crop
OUT  scale_fit row: method, factor_x, factor_y, anisotropy_ratio, checks
     HUMAN confirms, or draws a calibration line     -> screen Scale
```

Every viewport must be scaled (`open-questions.md` 16, answered). A viewport without a
confirmed scale is **locked** and cannot carry a measurement.

## Schema

```python
class KnownDimensionLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str            # literal, as printed: "22'-0\"", "4500", "1'-7½\""
    x1: int              # arrowhead tip / extension-line intersection, norm_1000 in crop
    y1: int
    x2: int
    y2: int


class ScaleReading(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x_line: KnownDimensionLine | None  # one horizontal dimension line
    y_line: KnownDimensionLine | None  # one vertical dimension line
```

The printed scale comes only from 002. This call returns the two reference-line locations
and their literal dimension text; it never rereads a scale, returns a factor, or converts a
length to mm. Everything numeric is computed below.

## Prompt

```python
SCALE_PROMPT = """\
This image is one viewport from a construction sheet. Its printed scale was already read \
in an earlier stage; do not find or report a scale note.

Find at most TWO known dimension lines:

- x_line: one clear HORIZONTAL dimension line, if present.
- y_line: one clear VERTICAL dimension line, if present.

A known dimension line has a printed dimension value and arrowheads or extension lines that \
identify exactly what that value measures. For each line, copy "text" EXACTLY as printed, \
including feet, inch marks, and fractions: "22'-0\\"", "1'-7½\\"", "4500", "2'-6\\"". \
Do not convert, simplify a fraction, or drop an inch mark.

Set x1, y1, x2, y2 at the two arrowhead tips or at the corresponding extension-line \
intersections. Do not use the bounding box of the dimension text. The X line must be \
horizontal and the Y line must be vertical in this viewport crop. Prefer a long, clean, \
unambiguous line; return null for an axis when none can be read with confidence.

Do not compute anything. Do not report a length in millimetres or a scale you worked out.

Coordinates are 0-1000 across this image, origin top-left, x right, y down.
"""
```

Same `SYSTEM` constant as 002.

**Why vision and not the text layer.** The sample package is imperial and the PDF text
layer shatters fraction glyphs: `1'-7½"` extracts as `1'-71` plus `2"`, and `4½"` as `4`,
`1`, `2`. The stacked-fraction glyph splits into numerator and denominator as separate
tokens. Vision on the rendered crop recovers it; the vector geometry then confirms it.

## Deterministic scale interpretation

The triage model preserves the raw `ScaleNote`; deterministic code owns all calculations.
Its `kind` selects a narrow parser rather than asking one catch-all parser to guess what
arbitrary text means. The sole exception is explicit plain-English scale text: triage may
provide its canonical `normalized_ratio`, which code parses and then checks against X/Y
evidence.

```python
class ParsedScale(BaseModel):
    kind: ScaleKind
    factor: Decimal | None
    status: Literal["numeric", "non_numeric", "unparseable"]

def parse_scale_note(note: ScaleNote) -> ParsedScale:
    """Parse symbolic notation, or normalized_ratio when kind is plain_text."""

def parse_normalized_ratio(text: str) -> Decimal | None:
    """'1:96' -> 96. '2:1' -> 0.5. Anything else -> None."""

def parse_length_mm(text: str) -> Decimal | None:
    """'22'-0\"' -> 6705.6.  '1'-7½\"' -> 495.3.  '4500' -> 4500."""
```

`ratio` accepts forms such as `1:100`, `1 : 100`, `1:1`, and `2:1`.
`imperial_architectural` accepts forms such as `1/8\" = 1'-0\"`;
`imperial_engineering` accepts forms such as `1\" = 10'`. `plain_text` uses only its
triage-supplied `normalized_ratio`; it never parses or calculates from arbitrary words.
`graphic`, `as_indicated`, and `not_to_scale` intentionally return `non_numeric`. A
normalized_ratio supplied for any kind other than `plain_text`, or any malformed value,
returns `unparseable`, never a guessed factor.

Imperial scale maths, written out because it is easy to get backwards:

```
1/8" = 1'-0"
  drawing distance   1/8 in
  real distance      12 in
  factor             12 / (1/8) = 96
```

General form `a/b" = c'-d"` gives `factor = (c*12 + d) / (a/b)`.

## Deterministic validation

The model proposes one X and one Y reference line. Code verifies rather than trusting
those coordinates:

```
norm_1000 crop endpoints
  -> constrain a local snap to the rendered/PDF dimension line and its arrowhead endpoints
  -> map both snapped endpoints through page_from_image
  -> calculate paper length
  -> parse the literal real-world dimension
  -> calculate factor_x or factor_y
```

The snap must stay local to the proposed line. A distant line that happens to produce a
plausible value is not evidence. Store the proposed endpoints, snapped endpoints, snap
residual, literal text, and parsed length in `scale_fit.checks` so the UI can explain the
result and redraw the evidence.

```python
paper_mm = distance_pt(p1, p2) * Decimal("25.4") / 72
factor = parse_length_mm(line.text) / paper_mm
```

For a numeric printed scale, compare each available factor independently with its parsed
factor: `abs(factor_axis - printed) / printed`. The tolerance is 1%. A missing line, failed
snap, unreadable value, or disagreement does not confirm a scale.

## Recommendation states

```
1  PRINTED_AGREES
   numeric printed scale + snapped X and Y lines; both are within 1% of it

2  XY_DERIVED
   no numeric printed scale + snapped X and Y lines agree within 1%

3  NEEDS_CHOICE
   printed scale and either X/Y result disagree, X and Y disagree, or only one usable line exists

4  HUMAN_CALIBRATED
   the user draws a line and types its real length
```

Every state is a recommendation, never an automatic confirmation. `NTS`, `NOT TO SCALE`,
and `DO NOT SCALE` always require an explicit human confirmation before a derived factor
can be used.

## Anisotropy

Use the snapped X and Y known lines **independently**.

```python
ratio = max(factor_x, factor_y) / min(factor_x, factor_y)
if ratio > Decimal("1.01"):
    refuse — the sheet was plotted stretched
```

Never average the two. An anisotropic plot is a real thing that happens when a sheet is
re-plotted to a different paper size on one axis, and averaging hides it behind a plausible
number.

## The round-number check

A second, independent test that costs nothing and is stronger than comparing two printed
values.

A correct factor makes drawn geometry land on round values in the drawing's own unit.
Verified on the sample: at 1:96, a column path measuring 9.0 × 18.0 pt resolves to exactly
12.000 × 24.000 in. A wrong factor gives 11.3 or 25.8.

```python
def roundness_score(factor, sample_lengths_pt, unit) -> Decimal:
    """Fraction of measured lengths landing within 1% of a round value in `unit`."""
```

Report it as evidence alongside the validation result. Do not gate on it — a loosely drafted
set will score badly while being correctly scaled.

## Human actions

```
POST /viewports/{id}/scale/suggest    run call 2, return X/Y line evidence and checks
PUT  /viewports/{id}/scale            confirm the fit, OR submit a calibration
```

Calibration payload reuses the shape already in `quanto-demo`
(`features/scale/types.ts`): two points, a real distance, a unit including `ft_in`, and an
optional verification pair whose deviation is shown back.

Reuse `features/scale/components/CalibrationCanvas.tsx` for the drawing gesture.

## Invalidation

`scale_fit` carries the `crop_version` it was fitted against. Editing the viewport box
bumps `crop_version`, so the fit reads stale and the UI shows it. No dependency graph —
one integer compare.

## Files

```
core/scale.py         SCALE_PROMPT, ScaleReading, parse_scale_note,
                      parse_length_mm, snap_dimension_line, validate_scale,
                      anisotropy, roundness_score
api/routes/scale.py   suggest, confirm, calibrate
```

One module. Validation is a plain function, not a strategy class.

## Tests

| Test | Expects |
|---|---|
| `test_parse_ratio` | `1:100`, `1 : 100`, `1:1`, and `2:1` route through the ratio parser |
| `test_parse_imperial_architectural` | `1/8" = 1' 0"` → factor 96 |
| `test_parse_imperial_engineering` | `1" = 10'` → factor 120 |
| `test_plain_text_uses_normalized_ratio` | `one eighth inch equals one foot` + `1:96` → factor 96 |
| `test_symbolic_scale_rejects_normalized_ratio` | symbolic notation with a model-supplied normalized ratio is `unparseable` |
| `test_non_numeric_scale_kinds` | `graphic`, `as_indicated`, and `not_to_scale` return `non_numeric`, never a guessed factor |
| `test_unparseable_text_fails_safe` | plain text with no valid normalized ratio returns `unparseable` |
| `test_x_y_line_factors` | snapped X and Y lines on p23 each give 96 ± 1% |
| `test_printed_scale_agrees` | p23 printed scale and both known-line factors agree within 1% |
| `test_anisotropy_refuses` | factors 96 and 99 raise rather than averaging to 97.5 |
| `test_failed_snap_needs_choice` | a distant or failed snap cannot validate a scale |
| `test_no_known_lines` | a viewport with no usable X/Y lines falls to `human_calibrated`, does not crash |
| `test_stale_on_crop_edit` | bumping `crop_version` marks the fit stale |

## Done when

Sheets 23 and 25 propose one snapped X and one snapped Y line that each yield 96, the
printed scale agreement and any disagreement are visible to the user, the anisotropy check
refuses a stretched fit instead of averaging it, and a viewport with no readable lines
falls cleanly to human calibration.

## Risk

Some viewports have no clear horizontal or vertical dimension line. In that case human
calibration is the normal path rather than a failure, and the Scale screen should lead with
the calibration gesture instead of presenting it as an override. Measure this on the sample
before building the screen.
