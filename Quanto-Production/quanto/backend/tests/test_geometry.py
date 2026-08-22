from app.services.pdf.geometry import apply_affine, invert_affine, norm01_box_to_page_mpt, page_mpt_box_to_norm01


def test_affine_round_trip():
    transform = [0.5, 0.0, 0.0, 0.5, 10.0, 20.0]
    inv = invert_affine(transform)
    page = apply_affine(transform, 200, 100)
    image = apply_affine(inv, *page)
    assert round(image[0], 6) == 200
    assert round(image[1], 6) == 100


def test_rotated_page_box_round_trip():
    image_from_page = [0.0, 1.0, -1.0, 0.0, 400.0, 0.0]
    page_from_image = invert_affine(image_from_page)
    original = [0.10, 0.20, 0.80, 0.90]
    bbox_mpt = norm01_box_to_page_mpt(original, 400, 600, page_from_image)
    returned = page_mpt_box_to_norm01(bbox_mpt, page_from_image, 400, 600)
    for expected, actual in zip(original, returned):
        assert abs(expected - actual) <= 0.002
