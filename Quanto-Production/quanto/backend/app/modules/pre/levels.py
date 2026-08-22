from __future__ import annotations

from uuid import UUID

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


def rank(label: str) -> int | None:
    key = " ".join(label.lower().replace("_", " ").split())
    for token, value in RANK.items():
        if token in key:
            return value
    return None


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
        key = " ".join(row["level_label"].lower().split())
        dedup.setdefault(key, row)
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
