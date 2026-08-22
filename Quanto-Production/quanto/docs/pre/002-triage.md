# 002 — Triage

Model call 1. One rendered page in, a sheet discipline summary plus viewport boxes out.
The only stage that decides what is on a sheet.

## In / out

```
IN   page + its 150 DPI render + page_from_image
OUT  sheet row (discipline summary, title block), viewport rows (box in mpt)
     HUMAN then edits boxes, retypes, includes/excludes  -> screens Upload, Plans
```

## Schema

Plain pydantic. No builder, no factory, no generator. `extra="forbid"` everywhere so a
model inventing a field fails loudly.

```python
class ViewportDiscipline(StrEnum):
    ARCHITECTURAL = "architectural"
    STRUCTURAL = "structural"
    CIVIL_SITE = "civil_site"
    MEP = "mep"
    GENERAL = "general"
    MIXED = "mixed"
    UNKNOWN = "unknown"


class ViewportViewKind(StrEnum):
    PLAN = "plan"
    ELEVATION = "elevation"
    SECTION = "section"
    DETAIL = "detail"
    SCHEDULE = "schedule"
    NOTES = "notes"
    LEGEND = "legend"
    KEY_PLAN = "key_plan"
    OTHER = "other"
    UNKNOWN = "unknown"


class ViewportSubject(StrEnum):
    FOUNDATION = "foundation"
    FOOTING = "footing"
    RAFT = "raft"
    PILE = "pile"
    PILE_CAP = "pile_cap"
    GROUND_BEAM = "ground_beam"
    RETAINING_WALL = "retaining_wall"
    COLUMN = "column"
    BEAM = "beam"
    SLAB = "slab"
    STRUCTURAL_WALL = "structural_wall"
    STAIR = "stair"
    ROOF_STRUCTURE = "roof_structure"
    CONNECTION = "connection"
    REINFORCEMENT = "reinforcement"
    WALL = "wall"
    DOOR = "door"
    WINDOW = "window"
    FINISH = "finish"
    OTHER = "other"
    UNKNOWN = "unknown"


class ScaleKind(StrEnum):
    RATIO = "ratio"                              # "1:100", "1:1", "2:1"
    IMPERIAL_ARCHITECTURAL = "imperial_architectural"
    IMPERIAL_ENGINEERING = "imperial_engineering"
    GRAPHIC = "graphic"                          # scale bar
    AS_INDICATED = "as_indicated"
    NOT_TO_SCALE = "not_to_scale"
    PLAIN_TEXT = "plain_text"
    UNKNOWN = "unknown"


class Box(BaseModel):
    """Normalised 0-1000, top-left origin. The model's only coordinate space."""
    model_config = ConfigDict(extra="forbid")
    x1: int = Field(ge=0, le=1000)
    y1: int = Field(ge=0, le=1000)
    x2: int = Field(ge=0, le=1000)
    y2: int = Field(ge=0, le=1000)

    @model_validator(mode="after")
    def positive_extent(self):
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("box needs x2 > x1 and y2 > y1")
        return self


class ScaleNote(BaseModel):
    """Verbatim scale evidence and where it was read in page norm_1000 coordinates."""
    model_config = ConfigDict(extra="forbid")
    text: str | None                 # null only for a graphic scale with no readable text
    kind: ScaleKind
    normalized_ratio: str | None     # only plain-English text, canonical drawing:real form
    box: Box
    source: Literal["viewport", "title_block"]

    @model_validator(mode="after")
    def normalized_ratio_only_for_plain_text(self):
        if self.kind is not ScaleKind.PLAIN_TEXT and self.normalized_ratio is not None:
            raise ValueError("normalized_ratio is allowed only for plain_text scales")
        return self


class Viewport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    discipline: ViewportDiscipline
    view_kind: ViewportViewKind
    subjects: list[ViewportSubject]
    box: Box
    stated_scale: ScaleNote | None  # applicable local or title-block scale, or null
    level_label: str | None       # copied exactly as printed, or null
    relevant: bool
    why: str


class TitleBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sheet_no: str | None
    title: str | None
    discipline: str | None
    revision: str | None
    issue_date: str | None
    scale: ScaleNote | None         # sheet-level scale, including its page location
    evidence: list[str]           # the title-block text these were read from


class TriageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sheet_disciplines: list[ViewportDiscipline]
    sheet_discipline_evidence: list[str]
    unknown_reason: str | None
    title_block: TitleBlock
    viewports: list[Viewport]
```

Nullable evidence fields represent information that is absent or not legible. `null` is
different from a blank string: it lets the UI show `—` honestly instead of an invented sheet
number, scale, or level.

## Prompt

Two constants in `triage.py`. Adapted from `BOQ Automation`'s tuned version — the rules
below are the ones that were learned from real sheets, not invented here.

```python
SYSTEM = """\
You are indexing construction drawing sheets for a quantity surveyor preparing a Bill of \
Quantities to RICS NRM 2.

You transcribe and locate. You do not measure, calculate a quantity, or infer construction \
that is not drawn.

Report only what is visible. Where a fact is not legible, the correct answer is null.
"""

PROMPT = """\
You are indexing ONE construction drawing sheet: page {page_number} of "{filename}".

Work in two steps, in this order.

STEP 1 - SEE. List EVERY distinct titled drawing, table, legend or note block. Do not \
filter yet. Do not skip anything you think is irrelevant.

STEP 2 - JUDGE. For each, set relevant true or false with a one-phrase reason in "why". \
Never delete an item to express irrelevance. Listing everything is required; a human does \
the filtering, and can only remove what you showed them.

WHAT COUNTS AS ONE VIEWPORT
- One titled drawing = one viewport. Example "GROUND FLOOR PLAN", "SECTION A-A", \
"GENERAL ARRANGEMENT OF COLUMNS & WALLS", "Door & Window Schedule" "Note".
- A repeating ARRAY under one heading is ONE viewport, not one per item.
- Never emit two viewports for the same drawing, and never one that swallows several \
differently titled drawings.
- You must Box the sheet's title block and use the dedicated tittle_block section but never include in as a part of the viewport.

BOX RULES
Each box must FULLY CONTAIN, with a small margin: the drawing edge to edge including its \
outermost linework, its title and scale text, its level and datum labels, dimension \
strings, grid bubbles, every section flag and detail callout drawn on it, and any leader \
that points into it and callouts for column, then the number with arrow for sectioning views.

FULL EXTENT. Before fixing y1 find the HIGHEST ink belonging to the drawing - a roof \
ridge, the top grid bubble, the top dimension string - and start above it. Before fixing \
y2 find the LOWEST ink and end below it. Same for x1 and x2. An elevation with its gable \
clipped off is a serious error. Cutting through a label or linework is a serious error.

VIEWPORT CLASSIFICATION
For every viewport report discipline, view_kind, and subjects separately. Do not combine \
them into one label.

discipline is the primary design discipline: architectural, structural, civil_site, mep, \
general, mixed, or unknown. view_kind is how the viewport represents information: plan, \
elevation, section, detail, schedule, notes, legend, key_plan, other, or unknown.

subjects is a list. Include every visibly represented or explicitly titled construction \
subject from the closed vocabulary: foundation, footing, raft, pile, pile_cap, ground_beam, \
retaining_wall, column, beam, slab, structural_wall, stair, roof_structure, connection, \
reinforcement, wall, door, window, finish, other, unknown. A structural foundation plan may \
therefore have subjects ["pile", "pile_cap", "ground_beam", "foundation"].

Use a subject only when it is visible, explicitly titled, or clearly identified by marks or \
annotations. Do not infer pile_cap merely because a viewport is structural. For notes, \
legends, key plans, or general schedules with no specific construction subject, return an \
empty subjects list. A storey is not a view kind: copy it into level_label.

SCALE
Copy every applicable scale note EXACTLY as printed. It may be a metric ratio ("1:50", \
"1 : 100"), an imperial architectural scale ("1/4\" = 1'-0\""), an imperial \
engineering or civil scale ("1\" = 10'"), a full-size or enlargement ratio ("1:1", \
"2:1"), a scale with a paper-size qualifier ("1:100 @ A1"), or plain English. \

For every scale note return its exact text (or null for an unlabelled graphic scale), its \
bounding box, and one kind: ratio, imperial_architectural, imperial_engineering, graphic, \
as_indicated, not_to_scale, plain_text, or unknown. This kind describes the notation. \

Set normalized_ratio only when kind is plain_text and the written words state one explicit, \
legible scale. Use canonical drawing:real form. For example, "one eighth inch equals one \
foot" gives normalized_ratio "1:96". For ratio, imperial_architectural, \
imperial_engineering, graphic, as_indicated, not_to_scale, unknown, or any uncertainty, \
normalized_ratio is null. Do not calculate, convert, simplify, or normalise those forms. \

Put a sheet-level title-block scale in title_block.scale. For each viewport, stated_scale \
is its own scale note when one is printed beside, below, or in its title. Otherwise it is \
the applicable title_block.scale. Never take a scale from a different viewport, and never \
compute, convert, simplify, or normalise a scale. \

Copy "NTS", "NOT TO SCALE", or "DO NOT SCALE" exactly when printed and set kind to \
not_to_scale. They record that no numerical scale is stated; do not invent one. Return null \
only when no applicable scale note is visible or legible for that viewport.

LEVEL
Copy any floor, storey or datum text that applies, exactly as printed: "GROUND FLOOR", \
"+6150mm", "FFL 0.000". Return null when none is shown.

TITLE BLOCK
Transcribe sheet number, title, discipline, revision, issue date, and any sheet-level scale \
- each exactly as printed or null. For the scale use the ScaleNote shape above. Quote in \
"evidence" the text you read them from. An absent or illegible title block means every \
field null and evidence empty. That is a correct answer.

CLASSIFICATION
Summarise the sheet with sheet_disciplines: every discipline represented by its viewports. \
Quote the visible sheet title, discipline code, or viewport title in sheet_discipline_evidence. \
Use unknown with a reason only when no discipline can be determined. Viewport classification \
is the routing data; the sheet summary is for browsing and filtering.

COORDINATES
x and y are 0-1000 across the image width and height. Origin top-left, x right, y down. \
x2 > x1 and y2 > y1.
"""
```

`PROMPT.format(page_number=..., filename=...)` at the call site. That is the whole
templating story — no builder.

## Model call

LangChain for provider abstraction, because more than one provider is likely.

```python
from langchain.chat_models import init_chat_model

model = init_chat_model("google_genai:gemini-flash-latest")   # configurable
out: TriageOutput = model.with_structured_output(TriageOutput).invoke([
    SystemMessage(SYSTEM),
    HumanMessage([
        {"type": "text", "text": PROMPT.format(...)},
        {"type": "image_url", "image_url": render_data_url(page, dpi=150)},
    ]),
])
```

Retry twice on validation failure, feeding the pydantic error back as a user turn. Third
failure stores the raw response and marks the sheet `needs_review` — a page the model
cannot read is a reviewable outcome, not a crashed job.

Pages run concurrently, capped at 4. 28 pages, ~6 s each, so under a minute wall clock.

## Coordinate conversion

Model gives `norm_1000`. Code converts, in one function, once.

```python
def box_to_mpt(box, render, page_from_image) -> tuple[int, int, int, int]:
    # 1. norm -> render pixels, clamped, far edge held >= 1px past near edge
    # 2. all FOUR corners through page_from_image
    # 3. envelope: min/max over the four results
    # 4. to milli-points
```

All four corners because a rotated affine does not map the top-left corner to the minimum.
Every structural sheet in the sample set is landscape, so a two-corner version inverts
there and only there.

## Algorithm

```
for each page in document (concurrency 4):
    call model with the 150 DPI render
    validate -> TriageOutput
    insert sheet row (disciplines, title block, discipline evidence, included=true)
    for each viewport in output:
        box_to_mpt -> insert viewport row (status='ready', crop_version=1)
```



## Human actions

Screens Upload and Plans. Each is an API call, not a model call.


| Action                    | Endpoint                 | Effect                                                         |
| ------------------------- | ------------------------ | -------------------------------------------------------------- |
| Include / exclude a sheet | `PATCH /sheets/{id}`     | Excluded sheets leave the pipeline entirely (open-questions 8) |
| Move or resize a box      | `PATCH /viewports/{id}`  | Bumps `crop_version`                                           |
| Reclassify a viewport     | `PATCH /viewports/{id}`  | discipline, view_kind, and subjects only from closed enums     |
| Add a missed viewport     | `POST /viewports`        | Drawn on the page, same conversion path                        |
| Delete a viewport         | `DELETE /viewports/{id}` |                                                                |
| Confirm                   | `POST /confirmations`    | Hashes the viewport content                                    |




## Files

```
core/triage.py       SYSTEM, PROMPT, the pydantic models, run_triage(page)
core/boxes.py        box_to_mpt and its inverse
api/routes/triage.py POST /projects/{id}/triage, the viewport CRUD
```

Three files. The prompt is a string. The schema is plain Pydantic. No layer between them.

## Done when

28 pages classify, p23 and p25 each yield a GA viewport with the stated scale transcribed
exactly, boxes survive editing on a landscape sheet, and excluded sheets disappear from
every later stage.
