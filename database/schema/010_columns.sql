CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Production Columns extension. Existing module tables remain untouched.
DO $$
BEGIN
  ALTER TABLE takeoff_ui_state DROP CONSTRAINT IF EXISTS takeoff_ui_state_module_check;
  ALTER TABLE takeoff_ui_state
    ADD CONSTRAINT takeoff_ui_state_module_check CHECK (module IN ('floor','ceiling','roof','walls','stairs-ramps','doors-windows','columns'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS column_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  shape text NOT NULL DEFAULT 'unknown' CHECK (shape IN ('rectangular','circular','polygonal','unknown')),
  width_mm double precision,
  depth_mm double precision,
  diameter_mm double precision,
  material text,
  concrete_grade text,
  reinforcement_description text,
  reinforcement_rate_kg_per_m3 double precision,
  reinforcement_kg_per_column double precision,
  cover_mm double precision,
  fire_rating text,
  finish text,
  nrm_work_section text,
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_column_definition_project ON column_definition(project_id,status);

CREATE TABLE IF NOT EXISTS column_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  definition_id uuid REFERENCES column_definition(id) ON DELETE SET NULL,
  column_mark text,
  generated_bbox jsonb NOT NULL DEFAULT '{}'::jsonb,
  bbox jsonb NOT NULL DEFAULT '{}'::jsonb,
  center jsonb NOT NULL DEFAULT '{}'::jsonb,
  footprint jsonb NOT NULL DEFAULT '[]'::jsonb,
  shape text NOT NULL DEFAULT 'unknown' CHECK (shape IN ('rectangular','circular','polygonal','unknown')),
  rotation_degrees double precision,
  width_mm double precision,
  depth_mm double precision,
  diameter_mm double precision,
  section_source text,
  height_mm double precision,
  height_source text,
  concrete_volume_m3 double precision,
  formwork_area_m2 double precision,
  reinforcement_kg double precision,
  reinforcement_source text,
  include_in_boq boolean NOT NULL DEFAULT true,
  geometry_user_modified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  confidence double precision,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(floor_id, source_viewport_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_column_instance_project ON column_instance(project_id,status);
CREATE INDEX IF NOT EXISTS idx_column_instance_floor ON column_instance(floor_id,status);
CREATE INDEX IF NOT EXISTS idx_column_instance_definition ON column_instance(definition_id);

CREATE TABLE IF NOT EXISTS column_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  column_id uuid REFERENCES column_instance(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  code text,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_column_review_project ON column_review_item(project_id,resolved,severity);
