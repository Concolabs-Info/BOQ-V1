"""Which company a Clerk user belongs to, and what their role lets them do.
Roles and permissions are Postgres data. Clerk is not consulted here."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException

from ...core.auth import CurrentUser, get_current_user
from ...core.rbac import is_built_in_role, permissions_for_role
from ...database.connection import fetch_one
from .terms import has_accepted_current

COMPANY_LOGO_PATH = "/api/v1/platform/company/logo"


def company_logo_url(storage_key: str | None) -> str | None:
    if not (storage_key or "").strip():
        return None
    token = hashlib.sha256(storage_key.encode()).hexdigest()[:10]
    return f"{COMPANY_LOGO_PATH}?v={token}"


@dataclass(frozen=True)
class CompanyMembership:
    company_id: str
    company_name: str
    role: str
    logo_url: str | None = None


def get_company_membership(user_id: str) -> CompanyMembership | None:
    row = fetch_one(
        "SELECT c.id AS company_id, c.name AS company_name, cm.role AS role, c.logo_storage_key "
        "FROM company_member cm JOIN company c ON c.id = cm.company_id "
        "WHERE cm.user_id = %s",
        (user_id,),
    )
    if not row:
        return None
    return CompanyMembership(
        company_id=str(row["company_id"]),
        company_name=row["company_name"],
        role=row["role"],
        logo_url=company_logo_url(row.get("logo_storage_key")),
    )


def membership_permissions(membership: CompanyMembership) -> list[str]:
    from .roles import permissions_for_membership

    return permissions_for_membership(membership)


def _require_current_terms(current_user: CurrentUser) -> None:
    if not has_accepted_current(current_user.terms_accepted_at, current_user.terms_version):
        raise HTTPException(status_code=403, detail={"code": "terms", "message": "Accept the current terms to continue."})


def require_company(current_user: CurrentUser = Depends(get_current_user)) -> CompanyMembership:
    found = get_company_membership(current_user.id)
    if found is None:
        raise HTTPException(status_code=409, detail="onboarding_incomplete")
    _require_current_terms(current_user)
    return found


def require_permission(permission: str) -> Callable[[CurrentUser], CompanyMembership]:
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CompanyMembership:
        found = get_company_membership(current_user.id)
        if found is None:
            raise HTTPException(status_code=409, detail="onboarding_incomplete")
        _require_current_terms(current_user)
        allowed = permissions_for_role(found.role) if is_built_in_role(found.role) else membership_permissions(found)
        if permission not in allowed:
            raise HTTPException(status_code=403, detail="insufficient_permission")
        return found

    return dependency
