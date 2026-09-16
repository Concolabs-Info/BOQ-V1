"""Email-domain routing for founder onboarding.

Ported from the quanto-onboard onboarding-path rules. Clerk Organizations are
not used; a matching domain in our company table is what triggers join-vs-create.
"""
from __future__ import annotations

from dataclasses import dataclass

PUBLIC_EMAIL_DOMAINS = frozenset({
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "ymail.com",
    "rocketmail.com",
    "outlook.com",
    "hotmail.com",
    "hotmail.co.uk",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "gmx.com",
    "gmx.net",
    "zoho.com",
    "yandex.com",
    "mail.com",
    "tutanota.com",
    "hey.com",
    "fastmail.com",
    "hotmail.lk",
    "yahoo.lk",
    "sltnet.lk",
})


@dataclass(frozen=True)
class OnboardingPath:
    path: str
    domain: str | None


def normalize_email(email: str) -> str:
    return email.strip().lower()


def domain_of_email(email: str) -> str | None:
    value = normalize_email(email)
    at = value.rfind("@")
    if at == -1:
        return None
    domain = value[at + 1 :]
    return domain if domain and "." in domain else None


def is_personal_provider(domain: str) -> bool:
    return domain.lower() in PUBLIC_EMAIL_DOMAINS


def suggested_company_name(domain: str) -> str:
    label = domain.split(".")[0].replace("_", "-")
    return " ".join(part.capitalize() for part in label.split("-") if part)


def resolve_onboarding_path(email: str, domain_has_company) -> OnboardingPath:
    domain = domain_of_email(email)
    if not domain:
        raise ValueError("Invalid email address")
    if is_personal_provider(domain):
        return OnboardingPath(path="CREATE_MANUAL", domain=None)
    if domain_has_company(domain):
        return OnboardingPath(path="REQUEST_TO_JOIN", domain=domain)
    return OnboardingPath(path="CREATE_WITH_DOMAIN_LOCK", domain=domain)
