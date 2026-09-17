from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ....core.auth import CurrentUser, get_current_user
from ....modules.platform.account import account_deletion_status, delete_company, delete_my_account
from ....modules.platform.company import get_company, update_company
from ....modules.platform.invitations import (
    InvitationError,
    claim_invitation,
    list_pending_invitations,
    resend_invite,
    revoke_invite,
    send_invites,
)
from ....modules.platform.members import (
    assign_to_project,
    list_members,
    remove_member,
    unassign_from_project,
    update_member_role,
)
from ....modules.platform.membership import CompanyMembership, get_company_membership, require_company, require_permission
from ....modules.platform.roles import (
    create_custom_role,
    delete_custom_role,
    list_roles,
    permissions_for_membership,
    update_role,
)
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
    CompanyDeleteIn,
    AccountDeletionOut,
    AccountDeleteIn,
    CustomRoleIn,
    InviteBatchIn,
    InviteBatchOut,
    InviteClaimIn,
    InviteClaimOut,
    InviteFailureOut,
    MemberDirectoryOut,
    MemberOut,
    MemberProjectIn,
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
    RoleListOut,
    RoleOut,
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
        permissions=permissions_for_membership(found) if found else [],
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
            description=body.description,
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
        detail={"code": exc.code, "message": exc.message, "field": exc.field},
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


@router.delete("/platform/company", status_code=204)
def delete_company_settings(
    body: CompanyDeleteIn,
    membership: CompanyMembership = Depends(require_permission("billing:manage")),
) -> None:
    try:
        delete_company(membership, body.confirm_name)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.get("/platform/account/deletion-status", response_model=AccountDeletionOut)
def get_account_deletion_status(current_user: CurrentUser = Depends(get_current_user)) -> AccountDeletionOut:
    return AccountDeletionOut(**account_deletion_status(current_user.id))


@router.delete("/platform/account", status_code=204)
def delete_account(
    current_user: CurrentUser = Depends(get_current_user),
    body: AccountDeleteIn | None = None,
) -> None:
    try:
        delete_my_account(current_user, confirm_name=(body.confirm_name if body else None))
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


@router.get("/platform/company/roles", response_model=RoleListOut)
def get_company_roles(membership: CompanyMembership = Depends(require_company)) -> RoleListOut:
    return RoleListOut(roles=[RoleOut(**row) for row in list_roles(membership.company_id)])


@router.post("/platform/company/roles", response_model=RoleOut, status_code=201)
def post_company_role(
    body: CustomRoleIn,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> RoleOut:
    try:
        return RoleOut(**create_custom_role(
            membership,
            name=body.name,
            description=body.description,
            permissions=body.permissions,
        ))
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.patch("/platform/company/roles/{role_id}", response_model=RoleOut)
def patch_company_role(
    role_id: str,
    body: CustomRoleIn,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> RoleOut:
    try:
        return RoleOut(**update_role(
            membership,
            role_id,
            name=body.name,
            description=body.description,
            permissions=body.permissions,
        ))
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.delete("/platform/company/roles/{role_id}", status_code=204)
def delete_company_role(
    role_id: str,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> None:
    try:
        delete_custom_role(membership, role_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.post("/platform/company/members/{user_id}/projects", status_code=204)
def post_member_project(
    user_id: str,
    body: MemberProjectIn,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> None:
    try:
        assign_to_project(membership, user_id, body.project_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc


@router.delete("/platform/company/members/{user_id}/projects/{project_id}", status_code=204)
def delete_member_project(
    user_id: str,
    project_id: str,
    membership: CompanyMembership = Depends(require_permission("members:manage")),
) -> None:
    try:
        unassign_from_project(membership, user_id, project_id)
    except InvitationError as exc:
        raise _invite_http(exc) from exc
