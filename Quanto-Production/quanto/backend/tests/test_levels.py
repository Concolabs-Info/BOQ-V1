from app.modules.pre.levels import rank


def test_known_storey_ranking():
    assert rank("Ground Floor Plan") == 0
    assert rank("First Floor") == 1
    assert rank("Roof Terrace") == 90
    assert rank("Unknown Mezzanine") is None
