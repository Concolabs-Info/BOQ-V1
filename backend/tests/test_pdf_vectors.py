from app.services.pdf.vectors import clip_segment, drawing_segments


class Point:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


class Rect:
    x0, y0, x1, y1 = 1, 2, 9, 8


def test_clip_segment_keeps_and_clips_crossing_line():
    assert clip_segment((-5, 5), (15, 5), (0, 0, 10, 10)) == ((0.0, 5.0), (10.0, 5.0))
    assert clip_segment((-5, -5), (-1, -1), (0, 0, 10, 10)) is None


def test_drawing_segments_supports_lines_and_rectangles():
    segments = drawing_segments([("l", Point(0, 0), Point(4, 3)), ("re", Rect())])
    assert segments[0] == ((0.0, 0.0), (4.0, 3.0))
    assert len(segments) == 5

