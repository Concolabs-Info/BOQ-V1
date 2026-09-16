"""Which company a Clerk user belongs to, and what their role lets them do.
See docs/superpowers/specs/2026-09-16-org-auth-onboarding-design.md."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException

from ...core.auth import CurrentUser, get_current_user
from ...core.rbac import permissions_for_role
from ...database.connection import fetch_one


@dataclass(frozen=True)
class CompanyMembership:
    company_id: str
    company_name: str
    role: str


def get_company_membership(user_id: str) -> CompanyMembership | None:
    row = fetch_one(
        "SELECT c.id AS company_id, c.name AS company_name, cm.role AS role "
        "FROM company_member cm JOIN company c ON c.id = cm.company_id "
        "WHERE cm.user_id = %s",
        (user_id,),
    )
    if not row:
        return None
    return CompanyMembership(company_id=str(row["company_id"]), company_name=row["company_name"], role=row["role"])


def require_company(current_user: CurrentUser = Depends(get_current_user)) -> CompanyMembership:
    found = get_company_membership(current_user.id)
    if found is None:
        raise HTTPException(status_code=409, detail="onboarding_incomplete")
    return found


def require_permission(permission: str) -> Callable[[CurrentUser], CompanyMembership]:
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CompanyMembership:
        found = get_company_membership(current_user.id)
        if found is None:
            raise HTTPException(status_code=409, detail="onboarding_incomplete")
        if permission not in permissions_for_role(found.role):
            raise HTTPException(status_code=403, detail="insufficient_permission")
        return found

    return dependency
