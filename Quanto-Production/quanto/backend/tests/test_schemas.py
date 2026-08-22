import pytest
from pydantic import ValidationError

from app.modules.pre.schemas import Box, ScaleKind, ScaleNote


def test_box_rejects_negative_extent():
    with pytest.raises(ValidationError):
        Box(x1=100, y1=100, x2=50, y2=200)


def test_ratio_rejects_normalized_ratio_field():
    with pytest.raises(ValidationError):
        ScaleNote(text="1:100", kind=ScaleKind.RATIO, normalized_ratio="1:100", box=Box(x1=1, y1=1, x2=2, y2=2), source="viewport")
