from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ...modules.pre.schemas import ViewportDiscipline, ViewportSubject, ViewportViewKind


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateProject(ApiModel):
    name: str = Field(min_length=1, max_length=160)
    project_number: str | None = Field(default=None, max_length=80)
    client_name: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=240)
    description: str | None = Field(default=None, max_length=2000)


class UpdateProject(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    project_number: str | None = Field(default=None, max_length=80)
    client_name: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "on_hold", "completed", "archived"] | None = None


class ViewportPatch(ApiModel):
    name: str | None = None
    parent_viewport_id: UUID | None = None
    discipline: ViewportDiscipline | None = None
    view_kind: ViewportViewKind | None = None
    subjects: list[ViewportSubject] | None = None
    bbox_mpt: list[int] | None = None
    bbox_norm: list[float] | None = None
    level_label: str | None = None
    relevant: bool | None = None

    @model_validator(mode="after")
    def one_box_space(self):
        if self.bbox_mpt is not None and self.bbox_norm is not None:
            raise ValueError("Send bbox_mpt or bbox_norm, not both")
        return self


class ViewportCreate(ApiModel):
    id: UUID | None = None
    sheet_id: UUID
    parent_viewport_id: UUID | None = None
    name: str
    discipline: ViewportDiscipline = ViewportDiscipline.UNKNOWN
    view_kind: ViewportViewKind = ViewportViewKind.UNKNOWN
    subjects: list[ViewportSubject] = Field(default_factory=list)
    bbox_mpt: list[int] | None = None
    bbox_norm: list[float] | None = None
    level_label: str | None = None
    relevant: bool = True
    why: str = "Added by user"

    @model_validator(mode="after")
    def exactly_one_box_space(self):
        if (self.bbox_mpt is None) == (self.bbox_norm is None):
            raise ValueError("Send exactly one of bbox_mpt or bbox_norm")
        return self


class SheetPatch(ApiModel):
    included: bool | None = None
    sheet_no: str | None = None
    title: str | None = None
    revision: str | None = None


class StoreyPatch(ApiModel):
    name: str | None = None
    typical_group: str | None = None


class StoreyCreate(ApiModel):
    name: str
    level_index: int
    typical_group: str | None = None


class StoreyReorder(ApiModel):
    storey_ids: list[UUID]


class ScaleConfirm(ApiModel):
    mode: Literal["suggested", "manual"]
    scale_fit_id: UUID | None = None
    chosen_factor: float | None = None
    axis: Literal["x", "y", "printed", "manual"] | None = None
    p1: list[float] | None = None
    p2: list[float] | None = None
    real_distance: str | None = None
    unit: str | None = None


class HeightSuggest(ApiModel):
    primary_viewport_id: UUID
    supporting_viewport_id: UUID | None = None


class HeightSet(ApiModel):
    height_mm: int | None = Field(default=None, gt=0)
    source_viewport_id: UUID | None = None
    y_top: int | None = Field(default=None, ge=0, le=1000)
    y_bottom: int | None = Field(default=None, ge=0, le=1000)
    basis: str = "user_adjusted"

    @model_validator(mode="after")
    def typed_or_band(self):
        typed = self.height_mm is not None
        band = self.source_viewport_id is not None and self.y_top is not None and self.y_bottom is not None
        if typed == band:
            raise ValueError("Send either height_mm, or source_viewport_id with y_top/y_bottom")
        if band and self.y_bottom <= self.y_top:
            raise ValueError("y_bottom must be below y_top")
        return self


class SpecCreate(ApiModel):
    id: UUID | None = None
    viewport_id: UUID | None = None
    page_id: UUID | None = None
    kind: str = "note"
    name: str = Field(min_length=1, max_length=240)
    topic: str | None = Field(default=None, max_length=240)
    raw_text: str = ""
    table_json: dict[str, Any] | None = None
    found: bool = True


class SpecPatch(ApiModel):
    raw_text: str | None = None
    table_json: dict[str, Any] | None = None
    name: str | None = None
    topic: str | None = None


class ConfirmationCreate(ApiModel):
    entity_type: str
    entity_id: UUID
    actor: str = "user"


class PlatformUser(ApiModel):
    id: str
    email: str
    full_name: str | None = None
    role: str
    status: str = "active"


class PlatformOrganization(ApiModel):
    id: str
    name: str
    status: str = "active"
    membership_role: str | None = None


class PlatformContext(ApiModel):
    user: PlatformUser
    organization: PlatformOrganization | None = None
    membership_role: str | None = None
    permissions: list[str]
    is_super_admin: bool = False


class OnboardingCompanyIn(ApiModel):
    name: str = Field(min_length=1, max_length=160)
    country: str = Field(default="Sri Lanka", max_length=80)
    registration_type: Literal["PV", "BR", "NONE"] | None = None
    registration_number: str | None = Field(default=None, max_length=80)
    lock_domain: bool = False


class OnboardingProjectIn(ApiModel):
    name: str = Field(min_length=1, max_length=160)
    client_name: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=240)
    project_number: str | None = Field(default=None, max_length=80)


class OnboardingCompanyOut(ApiModel):
    id: str
    name: str
    role: str = "admin"


class OnboardingProjectOut(ApiModel):
    id: str
    name: str


class OnboardingExistingCompany(ApiModel):
    id: str
    name: str
    domain: str | None = None


class OnboardingStatusOut(ApiModel):
    path: str
    domain: str | None = None
    suggested_name: str = ""
    existing_company: OnboardingExistingCompany | None = None
    former_company_name: str | None = None
    has_company: bool
    has_project: bool

class ScopeAnswer(ApiModel):
    choice: str | None = None
    value: str | None = None
    note: str | None = Field(default=None, max_length=2000)
