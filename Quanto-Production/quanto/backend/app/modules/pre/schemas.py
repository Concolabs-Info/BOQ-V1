from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


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
    RATIO = "ratio"
    IMPERIAL_ARCHITECTURAL = "imperial_architectural"
    IMPERIAL_ENGINEERING = "imperial_engineering"
    GRAPHIC = "graphic"
    AS_INDICATED = "as_indicated"
    NOT_TO_SCALE = "not_to_scale"
    PLAIN_TEXT = "plain_text"
    UNKNOWN = "unknown"


class Box(StrictModel):
    x1: int = Field(ge=0, le=1000)
    y1: int = Field(ge=0, le=1000)
    x2: int = Field(ge=0, le=1000)
    y2: int = Field(ge=0, le=1000)

    @model_validator(mode="after")
    def positive_extent(self):
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("box needs x2 > x1 and y2 > y1")
        return self


class ScaleNote(StrictModel):
    text: str | None
    kind: ScaleKind
    normalized_ratio: str | None
    box: Box
    source: Literal["viewport", "title_block"]

    @model_validator(mode="after")
    def normalized_ratio_only_for_plain_text(self):
        if self.kind is not ScaleKind.PLAIN_TEXT and self.normalized_ratio is not None:
            raise ValueError("normalized_ratio is allowed only for plain_text scales")
        return self


class ViewportProposal(StrictModel):
    name: str
    discipline: ViewportDiscipline
    view_kind: ViewportViewKind
    subjects: list[ViewportSubject]
    box: Box
    stated_scale: ScaleNote | None
    level_label: str | None
    relevant: bool
    why: str


class TitleBlock(StrictModel):
    sheet_no: str | None
    title: str | None
    discipline: str | None
    revision: str | None
    issue_date: str | None
    scale: ScaleNote | None
    evidence: list[str]


class TriageOutput(StrictModel):
    sheet_disciplines: list[ViewportDiscipline]
    sheet_discipline_evidence: list[str]
    unknown_reason: str | None
    title_block: TitleBlock
    viewports: list[ViewportProposal]


class KnownDimensionLine(StrictModel):
    text: str
    x1: int = Field(ge=0, le=1000)
    y1: int = Field(ge=0, le=1000)
    x2: int = Field(ge=0, le=1000)
    y2: int = Field(ge=0, le=1000)


class ScaleReading(StrictModel):
    x_line: KnownDimensionLine | None
    y_line: KnownDimensionLine | None


class StoreyBand(StrictModel):
    label: str | None
    height_text: str | None
    y_top: int = Field(ge=0, le=1000)
    y_bottom: int = Field(ge=0, le=1000)

    @model_validator(mode="after")
    def ordered(self):
        if self.y_bottom <= self.y_top:
            raise ValueError("y_bottom must be below y_top")
        return self


class HeightReading(StrictModel):
    bands: list[StoreyBand]


class SpecKind(StrEnum):
    NOTE = "note"
    SCHEDULE = "schedule"
    TYPE_KEY = "type_key"
    LEVEL_DATUM = "level_datum"
    UNIT_AREA = "unit_area"


class SpecTable(StrictModel):
    columns: list[str]
    rows: list[list[str]]


class SpecItemOutput(StrictModel):
    kind: SpecKind
    name: str
    topic: str | None
    raw_text: str
    table: SpecTable | None
    box: Box


class SpecReading(StrictModel):
    items: list[SpecItemOutput]
