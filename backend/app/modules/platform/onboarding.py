"""Create a company and first project during onboarding."""
from __future__ import annotations

from dataclasses import dataclass

from ...core.auth import CurrentUser
from ...database.connection import fetch_one, transaction
from .invitations import pending_invite_for_email
from .membership import get_company_membership
from .onboarding_path import (
    domain_of_email,
    is_personal_provider,
    resolve_onboarding_path,
    suggested_company_name,
)

try:
    from psycopg.errors import UniqueViolation
except ModuleNotFoundError:  # unit tests can raise a stand-in
    class UniqueViolation(Exception):
        pass

COUNTRY_CURRENCY = {
    "Sri Lanka": "LKR",
    "India": "INR",
    "Maldives": "MVR",
    "United Arab Emirates": "AED",
    "Qatar": "QAR",
    "Saudi Arabia": "SAR",
    "Singapore": "SGD",
    "United Kingdom": "GBP",
    "Australia": "AUD",
    "United States": "USD",
}


class OnboardingError(Exception):
    def __init__(self, code: str, message: str, *, field: str | None = None, extra: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field
        self.extra = extra or {}


@dataclass(frozen=True)
class CreatedCompany:
    id: str
    name: str
    role: str = "admin"


@dataclass(frozen=True)
class CreatedProject:
    id: str
    name: str


@dataclass(frozen=True)
class OnboardingStatus:
    path: str
    domain: str | None
    suggested_name: str
    existing_company: dict | None
    former_company_name: str | None
    has_company: bool
    has_project: bool
    pending_project_count: int = 0


def currency_for_country(country: str) -> str:
    return COUNTRY_CURRENCY.get(country.strip(), "USD")


def find_company_by_domain(domain: str) -> dict | None:
    if not domain:
        return None
    row = fetch_one(
        "SELECT id, name, domain FROM company WHERE lower(domain) = lower(%s)",
        (domain,),
    )
    if not row:
        return None
    return {"id": str(row["id"]), "name": row["name"], "domain": row["domain"]}


def former_company_name(user_id: str) -> str | None:
    row = fetch_one(
        "SELECT c.name FROM former_member fm JOIN company c ON c.id = fm.company_id "
        "WHERE fm.user_id = %s ORDER BY fm.removed_at DESC LIMIT 1",
        (user_id,),
    )
    return row["name"] if row else None


def company_project_count(company_id: str) -> int:
    row = fetch_one("SELECT count(*) AS n FROM project WHERE company_id = %s", (company_id,))
    return int(row["n"] if row else 0)


def onboarding_status(user: CurrentUser, *, as_founder: bool = False) -> OnboardingStatus:
    membership = get_company_membership(user.id)
    if membership:
        has_project = company_project_count(membership.company_id) > 0
        continue_wizard = membership.role == "admin" and not has_project
        return OnboardingStatus(
            path="CONTINUE_WIZARD" if continue_wizard else "DONE",
            domain=None,
            suggested_name="",
            existing_company={"id": membership.company_id, "name": membership.company_name, "domain": None},
            former_company_name=None,
            has_company=True,
            has_project=has_project,
        )

    pending = pending_invite_for_email(user.email)
    if pending:
        return OnboardingStatus(
            path="ACCEPT_INVITE",
            domain=pending.get("domain"),
            suggested_name="",
            existing_company={
                "id": pending["company_id"],
                "name": pending["company_name"],
                "domain": pending.get("domain"),
            },
            former_company_name=None,
            has_company=False,
            has_project=False,
            pending_project_count=int(pending.get("project_count") or 0),
        )

    if not as_founder:
        former = former_company_name(user.id)
        if former:
            return OnboardingStatus(
                path="REMOVED",
                domain=None,
                suggested_name="",
                existing_company=None,
                former_company_name=former,
                has_company=False,
                has_project=False,
            )

    if as_founder:
        return OnboardingStatus(
            path="CREATE_MANUAL",
            domain=None,
            suggested_name="",
            existing_company=None,
            former_company_name=None,
            has_company=False,
            has_project=False,
        )

    resolved = resolve_onboarding_path(user.email, lambda value: find_company_by_domain(value) is not None)
    existing = find_company_by_domain(resolved.domain) if resolved.path == "REQUEST_TO_JOIN" and resolved.domain else None
    return OnboardingStatus(
        path=resolved.path,
        domain=resolved.domain,
        suggested_name=suggested_company_name(resolved.domain) if resolved.domain else "",
        existing_company=existing,
        former_company_name=None,
        has_company=False,
        has_project=False,
    )


def create_company(
    user: CurrentUser,
    *,
    name: str,
    country: str,
    registration_type: str | None = None,
    registration_number: str | None = None,
    lock_domain: bool = False,
) -> CreatedCompany:
    if get_company_membership(user.id):
        raise OnboardingError("already_member", "You already belong to a company.")

    clean_name = name.strip()
    clean_country = country.strip() or "Sri Lanka"
    if not clean_name:
        raise OnboardingError("invalid", "Enter a company name.", field="name")

    domain = None
    if lock_domain:
        domain = domain_of_email(user.email)
        if not domain or is_personal_provider(domain):
            raise OnboardingError("invalid", "Your email has no usable work domain.")
        existing = find_company_by_domain(domain)
        if existing:
            raise OnboardingError("join_existing", "That company is already on Quanto.", extra=existing)

    reg_type = (registration_type or "").strip() or None
    number = (registration_number or "").strip() or None
    if not lock_domain:
        if reg_type not in {"PV", "BR", "NONE"}:
            raise OnboardingError("invalid", "Choose one.", field="regType")
        if reg_type in {"PV", "BR"} and not number:
            raise OnboardingError(
                "invalid",
                "Enter your PV or BR number, or choose “Not registered yet”.",
                field="registrationNumber",
            )
        if reg_type == "NONE":
            number = None
    else:
        number = None
        reg_type = None

    needs_review = (not lock_domain) and reg_type == "NONE"
    currency = currency_for_country(clean_country)

    try:
        with transaction() as conn:
            company = conn.execute(
                """INSERT INTO company (
                       name, domain, registration_type, registration_number, country, currency,
                       founder_user_id, needs_duplicate_review
                   ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id, name""",
                (clean_name, domain, reg_type, number, clean_country, currency, user.id, needs_review),
            ).fetchone()
            conn.execute(
                "INSERT INTO company_member (company_id, user_id, role) VALUES (%s, %s, %s)",
                (company["id"], user.id, "admin"),
            )
    except UniqueViolation as exc:
        text = str(exc).lower()
        if "uq_company_domain" in text or "company_domain" in text:
            existing = find_company_by_domain(domain or "")
            raise OnboardingError("join_existing", "That company is already on Quanto.", extra=existing or {}) from exc
        if "registration_number" in text:
            raise OnboardingError(
                "invalid",
                "This registration number is already registered on Quanto.",
                field="registrationNumber",
            ) from exc
        if "company_member" in text or "user_id" in text:
            raise OnboardingError("already_member", "You already belong to a company.") from exc
        raise

    return CreatedCompany(id=str(company["id"]), name=company["name"])


def _optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def create_first_project(
    user: CurrentUser,
    *,
    name: str,
    client_name: str | None = None,
    location: str | None = None,
    project_number: str | None = None,
    description: str | None = None,
) -> CreatedProject:
    membership = get_company_membership(user.id)
    if membership is None:
        raise OnboardingError("onboarding_incomplete", "Create a company first.")

    clean_name = name.strip()
    if not clean_name:
        raise OnboardingError("invalid", "Project name is required.", field="name")

    with transaction() as conn:
        project = conn.execute(
            """INSERT INTO project (name, project_number, client_name, location, description, company_id, created_by_user_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               RETURNING id, name""",
            (
                clean_name,
                _optional_text(project_number),
                _optional_text(client_name),
                _optional_text(location),
                _optional_text(description),
                membership.company_id,
                user.id,
            ),
        ).fetchone()
        conn.execute(
            "INSERT INTO project_member (project_id, user_id) VALUES (%s, %s)",
            (project["id"], user.id),
        )
    return CreatedProject(id=str(project["id"]), name=project["name"])
