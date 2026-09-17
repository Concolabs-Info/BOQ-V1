from pathlib import Path

import pytest

from datetime import datetime, timezone

from app.modules.platform import terms


def test_current_terms_version_matches_markdown():
    path = Path(__file__).resolve().parents[2] / "frontend" / "content" / "terms.md"
    text = path.read_text(encoding="utf-8")
    assert f'version: "{terms.CURRENT_TERMS_VERSION}"' in text


def test_has_accepted_current_requires_matching_version():
    accepted = datetime(2026, 9, 17, tzinfo=timezone.utc)
    assert terms.has_accepted_current(accepted, terms.CURRENT_TERMS_VERSION) is True
    assert terms.has_accepted_current(None, terms.CURRENT_TERMS_VERSION) is False
    assert terms.has_accepted_current(accepted, "1999-01-01") is False
    assert terms.has_accepted_current(accepted, "  ") is False


def test_accept_terms_stores_the_current_version(monkeypatch):
    seen = {}
    monkeypatch.setattr(terms, "execute", lambda sql, params=(): seen.update(params=params))
    assert terms.accept_terms("user_1", terms.CURRENT_TERMS_VERSION) == terms.CURRENT_TERMS_VERSION
    assert seen["params"] == (terms.CURRENT_TERMS_VERSION, "user_1")


@pytest.mark.parametrize("version", ["", "   ", "1999-01-01"])
def test_accept_terms_rejects_blank_and_stale_versions(monkeypatch, version):
    monkeypatch.setattr(terms, "execute", lambda sql, params=(): (_ for _ in ()).throw(AssertionError("must not store")))
    with pytest.raises(terms.TermsError) as excinfo:
        terms.accept_terms("user_1", version)
    assert excinfo.value.code == "invalid"
