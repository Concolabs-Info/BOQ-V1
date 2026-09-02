-- Beam takeoff — one SQLite file per deployment; runs are row-scoped by run_id.
CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,
    pdf_path    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'created',  -- created|running|awaiting_gate|done|error
    stage       TEXT,                             -- last stage reached (S0..S6)
    unit_system TEXT,                             -- metric|imperial (confirmed at GATE 2)
    grade       TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sheets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL,
    page_index  INTEGER NOT NULL,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    sheet_no    TEXT,
    title       TEXT,
    category    TEXT,      -- general_beam_layout|structural_floor_plan|architectural_floor_plan|
                           -- beam_sections|reinforcement_details|notes_spec|beam_schedule|irrelevant
    confidence  REAL,
    scale_denom REAL,      -- e.g. 50 for 1:50, verified at S2
    thumb_path  TEXT,
    hires_path  TEXT,
    UNIQUE(run_id, page_index)
);

CREATE TABLE IF NOT EXISTS viewports (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL,
    page_index  INTEGER NOT NULL,
    kind        TEXT NOT NULL,     -- same enum as sheets.category
    title       TEXT,
    bbox        TEXT NOT NULL,     -- JSON [x0,y0,x1,y1] as page fractions 0-1
    scale_text  TEXT,
    scale_denom REAL,
    confidence  REAL
);

CREATE TABLE IF NOT EXISTS layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL, page_index INTEGER NOT NULL, name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL, page_index INTEGER NOT NULL,
    layer TEXT, dashed INTEGER NOT NULL DEFAULT 0,
    x0 REAL, y0 REAL, x1 REAL, y1 REAL,
    length REAL
);

CREATE TABLE IF NOT EXISTS texts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL, page_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    x0 REAL, y0 REAL, x1 REAL, y1 REAL
);

CREATE TABLE IF NOT EXISTS evidence (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    sheet_no   TEXT,
    sheet_title TEXT,
    bbox       TEXT NOT NULL,   -- JSON [x0,y0,x1,y1] in page points
    crop_path  TEXT NOT NULL,
    note       TEXT
);

CREATE TABLE IF NOT EXISTS questions (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL,
    stage       TEXT NOT NULL,
    kind        TEXT NOT NULL,   -- solid_line_suspect|unknown_hatch|ht_unconfirmed|intersection_unresolved|
                                 -- missing_sheet_category|grade_not_found|scale_mismatch|floodfill_leak|unit_confirm
    text        TEXT NOT NULL,
    evidence_id TEXT,
    status      TEXT NOT NULL DEFAULT 'open',  -- open|answered
    answer      TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gates (
    run_id   TEXT NOT NULL,
    stage    TEXT NOT NULL,     -- GATE1..GATE5|FINAL
    status   TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed
    payload  TEXT,              -- JSON shown to user
    response TEXT,              -- JSON answer from user
    PRIMARY KEY (run_id, stage)
);

CREATE TABLE IF NOT EXISTS beams (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    mark       TEXT,
    x0 REAL, y0 REAL, x1 REAL, y1 REAL,   -- centerline in page points
    status     TEXT NOT NULL DEFAULT 'candidate',  -- candidate|uncertain|confirmed|rejected
    source     TEXT,             -- JSON: how identified (vision|vector|user) + evidence ids
    edge_gap   REAL              -- perpendicular distance between the two drawn edge lines (points)
);

CREATE TABLE IF NOT EXISTS beam_dims (
    beam_id      TEXT PRIMARY KEY,
    height_mm    REAL,
    thickness_mm REAL,
    source_kind  TEXT,    -- schedule|adjacent_dim|section|reinforcement|user
    method       TEXT,    -- direct|method1|method2|user
    evidence_id  TEXT,
    status       TEXT NOT NULL DEFAULT 'proposed'  -- proposed|confirmed|overridden
);

CREATE TABLE IF NOT EXISTS intersections (
    id       TEXT PRIMARY KEY,
    run_id   TEXT NOT NULL,
    a_beam   TEXT NOT NULL,
    b_beam   TEXT NOT NULL,
    x REAL, y REAL,
    owner    TEXT,     -- beam id owning the junction volume
    rule     TEXT,     -- same_thickness|thicker_owns|geometry_match|section|user
    status   TEXT NOT NULL DEFAULT 'proposed',
    evidence_id TEXT
);

CREATE TABLE IF NOT EXISTS beam_lengths (
    beam_id    TEXT PRIMARY KEY,
    gross_m    REAL NOT NULL,
    net_m      REAL NOT NULL,
    deductions TEXT   -- JSON list of {intersection_id, metres}
);

CREATE TABLE IF NOT EXISTS workbook (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    family TEXT NOT NULL,
    scope  TEXT NOT NULL,
    calc   TEXT NOT NULL,
    qty    REAL NOT NULL,
    unit   TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL    -- JSON: sheets, evidence ids, beam ids
);
