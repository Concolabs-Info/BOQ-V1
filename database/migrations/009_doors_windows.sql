CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Production Doors & Windows extension. Existing module tables remain untouched.
DO $$
BEGIN
  ALTER TABLE takeoff_ui_state DROP CONSTRAINT IF EXISTS takeoff_ui_state_module_check;
  ALTER TABLE takeoff_ui_state
    ADD CONSTRAINT takeoff_ui_state_module_check CHECK (module IN ('floor','ceiling','roof','walls','stairs-ramps','doors-windows'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS opening_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('door','window')),
  name text NOT NULL,
  description text,
  width_mm double precision,
  height_mm double precision,
  thickness_mm double precision,
  material text,
  frame_material text,
  leaf_material text,
  glazing text,
  operation text,
  leaf_count int,
  fire_rating text,
  acoustic_rating text,
  smoke_rating text,
  security_rating text,
  finish text,
  ironmongery_set text,
  sill_height_mm double precision,
  head_height_mm double precision,
  nrm_work_section text,
  scheduled_quantity double precision,
  location_text text,
  display_colour text NOT NULL DEFAULT '#2563eb',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_opening_definition_project ON opening_definition(project_id,kind,status);

CREATE TABLE IF NOT EXISTS opening_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  definition_id uuid REFERENCES opening_definition(id) ON DELETE SET NULL,
  host_wall_id uuid REFERENCES wall_instance(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('door','window')),
  opening_tag text,
  generated_bbox jsonb NOT NULL DEFAULT '{}'::jsonb,
  bbox jsonb NOT NULL DEFAULT '{}'::jsonb,
  center jsonb NOT NULL DEFAULT '{}'::jsonb,
  orientation_degrees double precision,
  visible_width_px double precision,
  clear_width_mm double precision,
  clear_height_mm double precision,
  gross_opening_area_m2 double precision,
  frame_perimeter_m double precision,
  sill_height_mm double precision,
  head_height_mm double precision,
  operation_hint text,
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
CREATE INDEX IF NOT EXISTS idx_opening_instance_project ON opening_instance(project_id,kind,status);
CREATE INDEX IF NOT EXISTS idx_opening_instance_floor ON opening_instance(floor_id,kind,status);
CREATE INDEX IF NOT EXISTS idx_opening_instance_host_wall ON opening_instance(host_wall_id);

CREATE TABLE IF NOT EXISTS opening_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  opening_id uuid REFERENCES opening_instance(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  code text,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opening_review_project ON opening_review_item(project_id,resolved,severity);
