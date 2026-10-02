from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.routes.boq_rate_mappings import RateMappingUpsert


def test_rate_mapping_trims_signature():
    rate_item_id = uuid4()

    mapping = RateMappingUpsert(row_signature="  beams|m3|B1|rcc-beam  ", rate_item_id=rate_item_id, score=92)

    assert mapping.row_signature == "beams|m3|B1|rcc-beam"
    assert mapping.rate_item_id == rate_item_id
    assert mapping.source == "manual"
    assert mapping.status == "applied"


def test_rate_mapping_requires_signature():
    with pytest.raises(ValidationError):
        RateMappingUpsert(row_signature="", rate_item_id=uuid4(), score=80)


def test_rate_mapping_rejects_negative_score():
    with pytest.raises(ValidationError):
        RateMappingUpsert(row_signature="columns|m3|C1|rcc-column", rate_item_id=uuid4(), score=-1)
