"""Company profile for settings. Clerk is not involved."""
from __future__ import annotations

from ...core.rbac import permissions_for_role
from ...database.connection import execute, fetch_one
from .invitations import InvitationError
from .membership import CompanyMembership
from .onboarding import COUNTRY_CURRENCY, currency_for_country


def get_company(membership: CompanyMembership) -> dict:
    row = fetch_one(
        "SELECT id, name, domain, registration_type, registration_number, tax_id, country, currency, phone "
        "FROM company WHERE id = %s",
        (membership.company_id,),
    )
    if not row:
        raise InvitationError("invalid", "Company not found.")
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "domain": row["domain"],
        "registration_type": row["registration_type"],
        "registration_number": row["registration_number"],
        "tax_id": row["tax_id"],
        "country": row["country"],
        "currency": row["currency"],
        "phone": row["phone"],
        "role": membership.role,
        "permissions": permissions_for_role(membership.role),
    }


def update_company(membership: CompanyMembership, *, name: str, country: str, tax_id: str | None = None, phone: str | None = None) -> dict:
    clean_name = name.strip()
    clean_country = country.strip() or "Sri Lanka"
    if not clean_name:
        raise InvitationError("invalid", "Enter a company name.")
    currency = COUNTRY_CURRENCY.get(clean_country) or currency_for_country(clean_country)
    execute(
        "UPDATE company SET name = %s, country = %s, currency = %s, tax_id = %s, phone = %s WHERE id = %s",
        (clean_name, clean_country, currency, (tax_id or "").strip() or None, (phone or "").strip() or None, membership.company_id),
    )
    return get_company(membership)
