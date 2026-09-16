from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ....core.auth import CurrentUser, get_current_user
from ....core.rbac import permissions_for_role
from ....modules.platform.membership import get_company_membership
from ....modules.platform.onboarding import (
    OnboardingError,
    OnboardingStatus,
    create_company,
    create_first_project,
    onboarding_status,
)
from ..schemas import (
    OnboardingCompanyIn,
    OnboardingCompanyOut,
    OnboardingExistingCompany,
    OnboardingProjectIn,
    OnboardingProjectOut,
    OnboardingStatusOut,
    PlatformContext,
    PlatformOrganization,
    PlatformUser,
)

router = APIRouter(tags=["platform"])


def _http_for(exc: OnboardingError) -> HTTPException:
    status = {
        "already_member": 409,
        "join_existing": 409,
        "onboarding_incomplete": 409,
        "forbidden": 403,
        "invalid": 400,
    }.get(exc.code, 400)
    existing = None
    if exc.extra.get("id"):
        existing = {
            "id": str(exc.extra["id"]),
            "name": exc.extra.get("name"),
            "domain": exc.extra.get("domain"),
        }
    return HTTPException(
        status_code=status,
        detail={"code": exc.code, "message": exc.message, "field": exc.field, "existing_company": existing},
    )


def _status_out(status: OnboardingStatus) -> OnboardingStatusOut:
    existing = None
    if status.existing_company:
        existing = OnboardingExistingCompany(
            id=str(status.existing_company["id"]),
            name=status.existing_company["name"],
            domain=status.existing_company.get("domain"),
        )
    return OnboardingStatusOut(
        path=status.path,
        domain=status.domain,
        suggested_name=status.suggested_name,
        existing_company=existing,
        former_company_name=status.former_company_name,
        has_company=status.has_company,
        has_project=status.has_project,
    )


@router.get("/platform/me", response_model=PlatformContext)
def get_me(current_user: CurrentUser = Depends(get_current_user)) -> PlatformContext:
    found = get_company_membership(current_user.id)
    role = found.role if found else "none"

    return PlatformContext(
        user=PlatformUser(id=current_user.id, email=current_user.email, full_name=current_user.full_name, role=role),
        organization=(
            PlatformOrganization(id=found.company_id, name=found.company_name, membership_role=found.role)
            if found else None
        ),
        membership_role=found.role if found else None,
        permissions=permissions_for_role(found.role) if found else [],
        is_super_admin=False,
    )


@router.get("/platform/onboarding/status", response_model=OnboardingStatusOut)
def get_onboarding_status(
    founder: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
) -> OnboardingStatusOut:
    return _status_out(onboarding_status(current_user, as_founder=founder))


@router.post("/platform/onboarding/company", response_model=OnboardingCompanyOut, status_code=201)
def post_onboarding_company(
    body: OnboardingCompanyIn,
    current_user: CurrentUser = Depends(get_current_user),
) -> OnboardingCompanyOut:
    try:
        created = create_company(
            current_user,
            name=body.name,
            country=body.country,
            registration_type=body.registration_type,
            registration_number=body.registration_number,
            lock_domain=body.lock_domain,
        )
    except OnboardingError as exc:
        raise _http_for(exc) from exc
    return OnboardingCompanyOut(id=created.id, name=created.name, role=created.role)


@router.post("/platform/onboarding/project", response_model=OnboardingProjectOut, status_code=201)
def post_onboarding_project(
    body: OnboardingProjectIn,
    current_user: CurrentUser = Depends(get_current_user),
) -> OnboardingProjectOut:
    try:
        created = create_first_project(
            current_user,
            name=body.name,
            client_name=body.client_name,
            location=body.location,
            project_number=body.project_number,
        )
    except OnboardingError as exc:
        raise _http_for(exc) from exc
    return OnboardingProjectOut(id=created.id, name=created.name)
