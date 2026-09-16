from __future__ import annotations

from fastapi import APIRouter, Depends

from ....core.auth import CurrentUser, get_current_user
from ....core.rbac import permissions_for_role
from ....modules.platform.membership import get_company_membership
from ..schemas import PlatformContext, PlatformOrganization, PlatformUser

router = APIRouter(tags=["platform"])


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
