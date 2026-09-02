from __future__ import annotations

from uuid import UUID
import re

from ...database.connection import fetch_all, transaction

RANK = {
    "basement": -1,
    "lower ground": -1,
    "ground": 0,
    "gf": 0,
    "level 0": 0,
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "terrace": 90,
    "roof terrace": 90,
    "roof": 95,
    "upper roof": 96,
    "machine room": 97,
    "water tank": 97,
}

ORDINALS = {
    "1st": "FIRST FLOOR", "first": "FIRST FLOOR",
    "2nd": "SECOND FLOOR", "second": "SECOND FLOOR",
    "3rd": "THIRD FLOOR", "third": "THIRD FLOOR",
    "4th": "FOURTH FLOOR", "fourth": "FOURTH FLOOR",
    "5th": "FIFTH FLOOR", "fifth": "FIFTH FLOOR",
    "6th": "SIXTH FLOOR", "sixth": "SIXTH FLOOR",
    "7th": "SEVENTH FLOOR", "seventh": "SEVENTH FLOOR",
}


def rank(label: str) -> int | None:
    key = " ".join(label.lower().replace("_", " ").split())
    for token, value in RANK.items():
        if token in key:
            return value
    return None


def is_storey_label(label: str | None) -> bool:
    """Reject datums, ranges and directional notes mistaken for storeys."""
    value = " ".join((label or "").strip().lower().split())
    if not value or value.startswith(("+", "-")) or "upto" in value or "up to" in value:
        return False
    if re.search(r"\b(?:rl|ffl)\s*[+\-]?\d", value):
        return False
    if "," in value or "&" in value or "/" in value:
        return False
    return rank(value) is not None


def expand_storey_labels(label: str | None) -> list[str]:
    """Turn an explicit ordinal floor list into individual storeys."""
    value = " ".join((label or "").strip().lower().split())
    if "upto" in value or "up to" in value:
        return []
    if "," in value or "&" in value:
        found = re.findall(r"\b(?:0?[1-7](?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh)\b", value)
        return list(dict.fromkeys(ORDINALS[token[1:] if token.startswith("0") else token] for token in found))
    return [label.strip()] if is_storey_label(label) else []


def rebuild_storey_stack(project_id: UUID | str, *, preserve_existing: bool = True) -> list[dict]:
    existing = fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),))
    if preserve_existing and existing:
        return existing

    rows = fetch_all(
        """SELECT v.id, v.level_label
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true AND v.view_kind='plan'
             AND v.level_label IS NOT NULL
           ORDER BY v.display_order""",
        (str(project_id),),
    )
    dedup: dict[str, dict] = {}
    for row in rows:
        for label in expand_storey_labels(row["level_label"]):
            candidate = {**row, "level_label": label}
            key = " ".join(label.lower().split())
            dedup.setdefault(key, candidate)
    ordered = sorted(
        dedup.values(),
        key=lambda r: (rank(r["level_label"]) is None, rank(r["level_label"]) or 0, r["level_label"]),
    )
    with transaction() as conn:
        conn.execute("DELETE FROM storey WHERE project_id=%s", (str(project_id),))
        for idx, row in enumerate(ordered):
            typical = "pending" if "typical" in row["level_label"].lower() else None
            conn.execute(
                """INSERT INTO storey(project_id,name,level_index,typical_group,source_viewport_id,status)
                   VALUES (%s,%s,%s,%s,%s,'proposed')""",
                (str(project_id), row["level_label"], idx, typical, str(row["id"])),
            )
    return fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),))
