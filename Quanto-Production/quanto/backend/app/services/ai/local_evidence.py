"""Deterministic evidence extraction used when no external vision provider is configured.

This mode is deliberately conservative. It reads the PDF text layer and creates review
proposals; it never claims to have visually understood geometry it did not inspect.
"""
from __future__ import annotations

import re
from pathlib import Path

import pymupdf

from ...modules.pre.schemas import (
    Box,
    ScaleKind,
    ScaleNote,
    SpecItemOutput,
    SpecKind,
    SpecReading,
    SpecTable,
    TitleBlock,
    TriageOutput,
    ViewportDiscipline,
    ViewportProposal,
    ViewportSubject,
    ViewportViewKind,
)

VIEW_PATTERNS: list[tuple[re.Pattern[str], ViewportViewKind]] = [
    (re.compile(r"\bSECTION\b", re.I), ViewportViewKind.SECTION),
    (re.compile(r"\bELEVATION\b", re.I), ViewportViewKind.ELEVATION),
    (re.compile(r"\bSCHEDULE\b", re.I), ViewportViewKind.SCHEDULE),
    (re.compile(r"\bLEGEND\b|\bKEY\b", re.I), ViewportViewKind.LEGEND),
    (re.compile(r"\bNOTES?\b|\bSPECIFICATION", re.I), ViewportViewKind.NOTES),
    (re.compile(r"\bDETAIL\b", re.I), ViewportViewKind.DETAIL),
    (re.compile(r"\bPLAN\b|\bLAYOUT\b", re.I), ViewportViewKind.PLAN),
]

LEVEL_PATTERN = re.compile(
    r"\b(?:LOWER\s+GROUND|GROUND|BASEMENT|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|"
    r"TYPICAL|ROOF(?:\s+TERRACE)?|LEVEL\s*[A-Z0-9.+-]+)\s*(?:FLOOR|PLAN|LEVEL)?\b",
    re.I,
)
SCALE_PATTERNS: list[tuple[re.Pattern[str], ScaleKind]] = [
    (re.compile(r"\b\d+\s*:\s*\d+\b(?:\s*@\s*[A-Z]\d)?", re.I), ScaleKind.RATIO),
    (re.compile(r"\b(?:\d+\s*/\s*\d+|\d+)\s*[\"″]\s*=\s*\d+\s*[\'′](?:\s*-?\s*\d+\s*[\"″])?", re.I), ScaleKind.IMPERIAL_ARCHITECTURAL),
    (re.compile(r"\b(?:NTS|NOT\s+TO\s+SCALE|DO\s+NOT\s+SCALE)\b", re.I), ScaleKind.NOT_TO_SCALE),
    (re.compile(r"\bAS\s+INDICATED\b", re.I), ScaleKind.AS_INDICATED),
]


def _clean_lines(text: str) -> list[str]:
    return [" ".join(line.split()) for line in text.splitlines() if line.strip()]


def _view_kind(text: str) -> ViewportViewKind:
    for pattern, kind in VIEW_PATTERNS:
        if pattern.search(text):
            return kind
    return ViewportViewKind.UNKNOWN


def _discipline(text: str) -> ViewportDiscipline:
    upper = text.upper()
    if any(token in upper for token in ("STRUCTURAL", "REINFORCEMENT", "FOUNDATION", "BEAM", "COLUMN")):
        return ViewportDiscipline.STRUCTURAL
    if any(token in upper for token in ("ARCHITECT", "FLOOR PLAN", "DOOR", "WINDOW", "FINISH")):
        return ViewportDiscipline.ARCHITECTURAL
    if any(token in upper for token in ("ELECTRICAL", "MECHANICAL", "PLUMBING", "HVAC", "FIRE ALARM")):
        return ViewportDiscipline.MEP
    if any(token in upper for token in ("SITE PLAN", "DRAINAGE", "ROAD", "CIVIL")):
        return ViewportDiscipline.CIVIL_SITE
    return ViewportDiscipline.UNKNOWN


def _subjects(text: str) -> list[ViewportSubject]:
    upper = text.upper()
    mapping = {
        "FOUNDATION": ViewportSubject.FOUNDATION,
        "FOOTING": ViewportSubject.FOOTING,
        "PILE CAP": ViewportSubject.PILE_CAP,
        "PILE": ViewportSubject.PILE,
        "GROUND BEAM": ViewportSubject.GROUND_BEAM,
        "RETAINING WALL": ViewportSubject.RETAINING_WALL,
        "COLUMN": ViewportSubject.COLUMN,
        "BEAM": ViewportSubject.BEAM,
        "SLAB": ViewportSubject.SLAB,
        "STAIR": ViewportSubject.STAIR,
        "ROOF": ViewportSubject.ROOF_STRUCTURE,
        "REINFORCEMENT": ViewportSubject.REINFORCEMENT,
        "WALL": ViewportSubject.WALL,
        "DOOR": ViewportSubject.DOOR,
        "WINDOW": ViewportSubject.WINDOW,
        "FINISH": ViewportSubject.FINISH,
    }
    result: list[ViewportSubject] = []
    for token, subject in mapping.items():
        if token in upper and subject not in result:
            result.append(subject)
    return result


def _scale_note(text: str) -> ScaleNote | None:
    for pattern, kind in SCALE_PATTERNS:
        match = pattern.search(text)
        if match:
            return ScaleNote(
                text=match.group(0),
                kind=kind,
                normalized_ratio=None,
                box=Box(x1=700, y1=875, x2=985, y2=945),
                source="title_block",
            )
    return None


def triage_from_pdf(document_path: Path, page_number: int, filename: str) -> TriageOutput:
    with pymupdf.open(document_path) as doc:
        page = doc[page_number - 1]
        text = page.get_text("text") or ""
    lines = _clean_lines(text)
    candidates = [line for line in lines if _view_kind(line) is not ViewportViewKind.UNKNOWN]
    title_priority = {
        ViewportViewKind.PLAN: 100,
        ViewportViewKind.SECTION: 95,
        ViewportViewKind.ELEVATION: 90,
        ViewportViewKind.SCHEDULE: 85,
        ViewportViewKind.DETAIL: 80,
        ViewportViewKind.LEGEND: 65,
        ViewportViewKind.NOTES: 40,
        ViewportViewKind.UNKNOWN: 0,
    }
    title = (
        max(candidates, key=lambda line: (title_priority[_view_kind(line)], min(len(line), 120)))
        if candidates
        else (lines[0] if lines else f"Page {page_number}")
    )
    # Classify from the chosen title instead of allowing unrelated notes elsewhere on
    # the sheet to override the primary drawing view.
    kind = _view_kind(title)
    discipline = _discipline(title + "\n" + text[:5000])
    level_match = LEVEL_PATTERN.search(title + "\n" + text)
    level_label = level_match.group(0) if level_match else None
    scale = _scale_note(text)

    sheet_no = None
    for pattern in (
        re.compile(r"(?:SHEET|DWG|DRAWING)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{1,20})", re.I),
        re.compile(r"\b([A-Z]{1,3}-?\d{2,4})\b"),
    ):
        match = pattern.search(text)
        if match:
            sheet_no = match.group(1)
            break
    revision_match = re.search(r"\bREV(?:ISION)?\s*[:#-]?\s*([A-Z0-9]+)\b", text, re.I)

    reason = "Local text-layer proposal; review the full-page crop and split/add viewports where needed"
    return TriageOutput(
        sheet_disciplines=[discipline],
        sheet_discipline_evidence=[title] if text else [],
        unknown_reason=None if text else "No usable PDF text layer; manual review is required",
        title_block=TitleBlock(
            sheet_no=sheet_no,
            title=title,
            discipline=discipline.value if discipline is not ViewportDiscipline.UNKNOWN else None,
            revision=revision_match.group(1) if revision_match else None,
            issue_date=None,
            scale=scale,
            evidence=lines[-12:] if lines else [],
        ),
        viewports=[
            ViewportProposal(
                name=title[:160],
                discipline=discipline,
                view_kind=kind,
                subjects=_subjects(title + "\n" + text[:5000]),
                box=Box(x1=15, y1=15, x2=985, y2=900),
                stated_scale=scale,
                level_label=level_label,
                relevant=True,
                why=reason,
            )
        ],
    )


def _topic(text: str) -> str | None:
    upper = text.upper()
    for token, topic in (
        ("CONCRETE", "concrete"), ("MASONRY", "masonry"), ("WALL", "masonry"),
        ("FINISH", "finishes"), ("ROOF", "roofing"), ("DOOR", "doors"),
        ("WINDOW", "windows"), ("FOUNDATION", "foundations"), ("LEVEL", "levels"),
    ):
        if token in upper:
            return topic
    return None


def _spec_kind(text: str) -> SpecKind:
    upper = text.upper()
    if "SCHEDULE" in upper:
        return SpecKind.SCHEDULE
    if re.search(r"\b(?:W|D|F|FF|FL)\s*[-:]?\s*\d+\s*(?:=|:)", upper):
        return SpecKind.TYPE_KEY
    if any(token in upper for token in ("FFL", "SSL", "DATUM", "LEVEL +", "LEVEL -")):
        return SpecKind.LEVEL_DATUM
    return SpecKind.NOTE


def _table_from_text(text: str) -> SpecTable | None:
    lines = _clean_lines(text)
    rows = [re.split(r"\s{2,}|\t+", line) for line in lines]
    rows = [row for row in rows if len(row) >= 2]
    if len(rows) < 2:
        return None
    width = max(len(row) for row in rows)
    padded = [row + [""] * (width - len(row)) for row in rows]
    return SpecTable(columns=padded[0], rows=padded[1:])


def specs_from_pdf(document_path: Path, page_number: int) -> SpecReading:
    with pymupdf.open(document_path) as doc:
        page = doc[page_number - 1]
        rect = page.rect
        blocks = page.get_text("blocks")
    items: list[SpecItemOutput] = []
    for index, block in enumerate(blocks):
        x0, y0, x1, y1, raw = block[:5]
        text = raw.strip()
        if len(text) < 45:
            continue
        kind = _spec_kind(text)
        first = _clean_lines(text)[0][:120] if _clean_lines(text) else f"Text block {index + 1}"
        table = _table_from_text(text) if kind is SpecKind.SCHEDULE else None
        box = Box(
            x1=max(0, min(1000, round(x0 / max(rect.width, 1) * 1000))),
            y1=max(0, min(1000, round(y0 / max(rect.height, 1) * 1000))),
            x2=max(1, min(1000, round(x1 / max(rect.width, 1) * 1000))),
            y2=max(1, min(1000, round(y1 / max(rect.height, 1) * 1000))),
        )
        if box.x2 <= box.x1 or box.y2 <= box.y1:
            continue
        items.append(
            SpecItemOutput(
                kind=kind,
                name=first,
                topic=_topic(text),
                raw_text=text,
                table=table,
                box=box,
            )
        )
    return SpecReading(items=items)
