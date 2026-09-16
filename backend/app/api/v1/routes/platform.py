from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ....core.auth import CurrentUser, get_current_user
from ....core.rbac import permissions_for_role
from ....modules.platform.company import get_company, update_company
from ....modules.platform.invitations import (
    InvitationError,
    claim_invitation,
    list_pending_invitations,
    resend_invite,
    revoke_invite,
    send_invites,
)
from ....modules.platform.members import list_members, remove_member, update_member_role
from ....modules.platform.membership import CompanyMembership, get_company_membership, require_company, require_permission
from ....modules.platform.onboarding import (
    OnboardingError,
    OnboardingStatus,
    create_company,
    create_first_project,
    onboarding_status,
)
from ..schemas import (
    CompanyOut,
    CompanyPatchIn,
    InviteBatchIn,
    InviteBatchOut,
    InviteClaimIn,
    InviteClaimOut,
    InviteFailureOut,
    MemberDirectoryOut,
    MemberOut,
    MemberRoleIn,
    OnboardingCompanyIn,
    OnboardingCompanyOut,
    OnboardingExistingCompany,
    OnboardingProjectIn,
    OnboardingProjectOut,
    OnboardingStatusOut,
    PendingInviteOut,
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
        "expired": 410,
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


@router.post("/platform/invitations", response_model=InviteBatchOut)
def post_invitations(
    body: InviteBatchIn,
    current_user: CurrentUser = Depends(get_current_user),
    membership=Depends(require_permission("members:manage")),
) -> InviteBatchOut:
    result = send_invites(
        current_user,
        membership,
        [row.model_dump() for row in body.invites],
    )
    return InviteBatchOut(
        sent=result.sent,
        failures=[InviteFailureOut(email=item.email, reason=item.reason) for item in result.failures],
    )


@router.post("/platform/invitations/claim", response_model=InviteClaimOut)
def post_invitation_claim(
    body: InviteClaimIn | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> InviteClaimOut:
    try:
        result = claim_invitation(current_user, token=(body.token if body else None))
    except InvitationError as exc:
        raise HTTPException(status_code={"expired": 410, "already_member": 409}.get(exc.code, 400), detail={"code": exc.code, "message": exc.message}) from exc
    return InviteClaimOut(
        claimed=result.claimed,
        already_member=result.already_member,
        company_id=result.company_id,
        company_name=result.company_name,
        role=result.role,
    )


def _invite_http(exc: InvitationError) -> HTTPException:
    return HTTPException(
        status_code={"expired": 410, "already_member": 409}.get(exc.code, 400),
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/platform/company", response_model=CompanyOut)
def get_company_settings(membership: CompanyMembership = Depends(require_company)) -> CompanyOut:
    return CompanyOut(**get_company(membership))


@router.patch("/platform/company", response_model=CompanyOut)
def patch_company_settings(
    body: CompanyPatchIn,
    membership: CompanyMembership = Depends(require_permission("company:manage")),
) -> CompanyOut:
    try:
        return CompanyOut(**update_company(membership, name=body.name, country=body.country, tax_id=body.tax_id, phone=body.phone))
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.get("/platform/company/members", response_model=MemberDirectoryOut)
def get_company_members(membership: CompanyMembership = Depends(require_company)) -> MemberDirectoryOut:
    return MemberDirectoryOut(
        members=[MemberOut(**row) for row in list_members(membership.company_id)],
        invitations=[PendingInviteOut(**row) for row in list_pending_invitations(membership.company_id)],
    )


@router.patch("/platform/company/members/{user_id}")
def patch_company_member(
    user_id: str,
    body: MemberRoleIn,
    current_user: CurrentUser = Depends(get_current_user),
    membership: CompanyMembership = Depends(require_permission("members:manage")),
):
    try:
        return update_member_role(current_user, membership, user_id, body.role)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.delete("/platform/company/members/{user_id}", status_code=204)
def delete_company_member(
    user_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> None:
    try:
        remove_member(current_user, membership, user_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.get("/platform/invitations")
def get_invitations(membership: CompanyMembership = Depends(require_permission("members:manage"))):
    return {"invitations": list_pending_invitations(membership.company_id)}


@router.post("/platform/invitations/{invitation_id}/revoke", status_code=204)
def post_revoke_invitation(
    invitation_id: str,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> None:
    try:
        revoke_invite(membership, invitation_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.post("/platform/invitations/{invitation_id}/resend", response_model=InviteBatchOut)
def post_resend_invitation(
    invitation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> InviteBatchOut:
    try:
        result = resend_invite(current_user, membership, invitation_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc
    return InviteBatchOut(
        sent=result.sent,
        failures=[InviteFailureOut(email=item.email, reason=item.reason) for item in result.failures],
    )
