import pytest
from pydantic import ValidationError

from app.modules.pre.schemas import Box, KnownDimensionLine, ScaleKind, ScaleNote, ScaleReading


def test_box_rejects_negative_extent():
    with pytest.raises(ValidationError):
        Box(x1=100, y1=100, x2=50, y2=200)


def test_ratio_rejects_normalized_ratio_field():
    with pytest.raises(ValidationError):
        ScaleNote(text="1:100", kind=ScaleKind.RATIO, normalized_ratio="1:100", box=Box(x1=1, y1=1, x2=2, y2=2), source="viewport")


def test_scale_reading_accepts_multiple_axis_candidates():
    line = KnownDimensionLine(text="21'-3\"", x1=100, y1=200, x2=900, y2=200)
    reading = ScaleReading(x_line=line, y_line=None, x_candidates=[line], y_candidates=[])
    assert reading.x_candidates[0].text == "21'-3\""
