from pathlib import Path

import pymupdf

from app.services.ai.local_evidence import specs_from_pdf, triage_from_pdf


def make_pdf(path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)
    page.insert_text((60, 70), "GROUND FLOOR PLAN", fontsize=18)
    page.insert_text((60, 105), "SCALE 1:100", fontsize=11)
    page.insert_text((60, 180), "GENERAL NOTES", fontsize=14)
    page.insert_text((60, 205), "Concrete shall be Grade 30. External walls shall be W1 = 230 mm brickwork.", fontsize=10)
    doc.save(path)
    doc.close()


def test_local_triage_and_specs(tmp_path: Path):
    source = tmp_path / "drawing.pdf"
    make_pdf(source)
    triage = triage_from_pdf(source, 1, "drawing.pdf")
    assert triage.viewports[0].view_kind.value == "plan"
    assert triage.viewports[0].level_label
    assert triage.title_block.scale and triage.title_block.scale.text == "1:100"
    specs = specs_from_pdf(source, 1)
    assert any("Grade 30" in item.raw_text for item in specs.items)
