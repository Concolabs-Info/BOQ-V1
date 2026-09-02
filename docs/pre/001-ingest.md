# 001 — Ingest

Take a PDF, produce pages and renders with a coordinate transform we can trust.
No model call. No human gate. Everything downstream depends on this being exact.

## In / out

```
IN   uploaded PDF file, project_id
OUT  document row, page row per page, page_render row per (page, dpi)
     rendered PNGs on disk
```

## Stack

`pymupdf` for parsing and rendering. `psycopg` for Postgres. FastAPI for the endpoint.
Files on local disk under `storage/<project_id>/`; `storage_key` is a relative path.

## Tables written

```sql
document      id, project_id, filename, page_count, storage_key
page          id, document_id, page_number, width_pt, height_pt, rotation
page_render   id, page_id, dpi, width_px, height_px, page_from_image float8[6],
              storage_key
```

Two DPI profiles: `72` for thumbnails, `150` for the working view and for vision calls.
150 DPI on a 1684×1191 pt sheet gives 3508×2481 px — enough detail for a model to read a
leader, small enough to send.

## The transform

The only hard part. Everything else is bookkeeping.

```python
# render
mat = pymupdf.Matrix(dpi / 72, dpi / 72)
pix = page.get_pixmap(matrix=mat)          # page rotation is applied by get_pixmap

# the matrix that actually maps unrotated page space -> image pixels
image_from_page = page.rotation_matrix * mat
page_from_image = ~image_from_page          # store these 6 floats
```

Store `page_from_image` as `[a, b, c, d, e, f]`. Later stages use it and never recompute a
DPI ratio by hand — a stage that divides by 150 somewhere is the bug this column exists to
prevent.

**Verify by round trip, do not trust the algebra.** A unit test takes the four corners of
the page rect, maps page → image → page, and asserts they come back within 0.01 pt. If
PyMuPDF's rotation handling differs from the line above, the test fails immediately rather
than three stages later as an inverted box.

## Page milli-points

Canonical geometry is integer milli-points. 1 pt = 1000 mpt.

```python
def to_mpt(pt: float) -> int:
    return round(pt * 1000)
```

Integers because a box is transformed repeatedly — model space to pixels to page to
display and back — and float drift accumulates silently. Integers either match or they
do not.

## Algorithm

```
1  save upload to storage/<project_id>/source/<filename>
2  open with pymupdf, read page_count
3  insert document row
4  for each page:
     insert page row  (page_number, width_pt, height_pt, rotation)
     for dpi in (72, 150):
       render, save PNG to storage/<project_id>/renders/p<n>@<dpi>.png
       insert page_render row with page_from_image
5  return document_id and page_count
```

Rendering 28 pages at two DPIs takes ~30 s on the sample file. Run it as a background task
and let the client poll — no queue, just a FastAPI `BackgroundTasks` and a `status` column
on `document`.

## Endpoint

```
POST /api/v1/projects/{project_id}/documents      multipart, returns document_id
GET  /api/v1/documents/{document_id}              status + page list, for polling
GET  /api/v1/renders/{page_render_id}             the PNG
```



## Files

```
api/routes/documents.py     the three endpoints
core/ingest.py              open, render, insert. one module, plain functions
core/geometry.py            to_mpt, from_mpt, apply_affine, invert
db/schema.sql               tables
```

No abstraction over storage, no render-profile registry, no ingest pipeline class. Two DPI
values live in a tuple in `ingest.py`. If a third profile is ever needed, add it to the
tuple.

## Done when

28 pages ingest, both render profiles exist on disk, and a box round-trips through
`page_from_image` on a landscape sheet without inverting.