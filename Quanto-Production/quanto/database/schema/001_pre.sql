CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  project_number text,
  client_name text,
  location text,
  description text,
  pre_status text NOT NULL DEFAULT 'draft',
  pre_frame jsonb,
  frame_version int NOT NULL DEFAULT 0,
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  filename text NOT NULL,
  page_count int,
  storage_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  size_bytes bigint,
  sha256 text,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_project ON document(project_id, created_at);

CREATE TABLE IF NOT EXISTS page (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  width_pt double precision NOT NULL,
  height_pt double precision NOT NULL,
  rotation int NOT NULL DEFAULT 0,
  UNIQUE(document_id, page_number)
);

CREATE TABLE IF NOT EXISTS page_render (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES page(id) ON DELETE CASCADE,
  dpi int NOT NULL,
  width_px int NOT NULL,
  height_px int NOT NULL,
  page_from_image double precision[] NOT NULL,
  storage_key text NOT NULL,
  UNIQUE(page_id, dpi)
);

CREATE TABLE IF NOT EXISTS sheet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL UNIQUE REFERENCES page(id) ON DELETE CASCADE,
  sheet_no text,
  title text,
  revision text,
  discipline text,
  issue_date text,
  title_block_scale jsonb,
  disciplines text[] NOT NULL DEFAULT '{}',
  discipline_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  included boolean NOT NULL DEFAULT true,
  crop_version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'proposed'
);

CREATE TABLE IF NOT EXISTS viewport (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES sheet(id) ON DELETE CASCADE,
  parent_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  name text NOT NULL,
  discipline text NOT NULL,
  view_kind text NOT NULL,
  subjects text[] NOT NULL DEFAULT '{}',
  bbox_mpt int4[] NOT NULL,
  level_label text,
  stated_scale jsonb,
  display_order int NOT NULL DEFAULT 0,
  relevant boolean NOT NULL DEFAULT true,
  why text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed',
  crop_version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scale_fit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewport_id uuid NOT NULL REFERENCES viewport(id) ON DELETE CASCADE,
  method text NOT NULL,
  factor_x numeric,
  factor_y numeric,
  anisotropy_ratio numeric,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed',
  crop_version int NOT NULL,
  scale_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scale_fit_viewport ON scale_fit(viewport_id, created_at DESC);

CREATE TABLE IF NOT EXISTS storey (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  level_index int NOT NULL,
  height_mm int,
  typical_group text,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  height_source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  height_y_top int,
  height_y_bottom int,
  height_basis text,
  height_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed',
  UNIQUE(project_id, level_index)
);

CREATE TABLE IF NOT EXISTS spec_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  page_id uuid REFERENCES page(id) ON DELETE SET NULL,
  kind text NOT NULL,
  name text NOT NULL,
  topic text,
  raw_text text NOT NULL DEFAULT '',
  table_json jsonb,
  bbox_mpt int4[],
  found boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed'
);

CREATE TABLE IF NOT EXISTS confirmation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  content_hash text NOT NULL,
  actor text NOT NULL DEFAULT 'user',
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_confirmation_entity ON confirmation(entity_type, entity_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_document ON page(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_viewport_sheet ON viewport(sheet_id, display_order);
CREATE INDEX IF NOT EXISTS idx_storey_project ON storey(project_id, level_index);
CREATE INDEX IF NOT EXISTS idx_spec_project ON spec_item(project_id, found DESC, name);
