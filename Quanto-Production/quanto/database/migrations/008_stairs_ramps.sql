CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Production Stairs & Ramps extension. Existing module tables remain untouched.
DO $$
BEGIN
  ALTER TABLE takeoff_ui_state DROP CONSTRAINT IF EXISTS takeoff_ui_state_module_check;
  ALTER TABLE takeoff_ui_state
    ADD CONSTRAINT takeoff_ui_state_module_check CHECK (module IN ('floor','ceiling','roof','walls','stairs-ramps'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stair_ramp_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('stair','ramp')),
  description text,
  construction_type text NOT NULL DEFAULT 'unknown',
  material text,
  width_mm double precision,
  riser_mm double precision,
  tread_mm double precision,
  waist_mm double precision,
  landing_thickness_mm double precision,
  support_condition text NOT NULL DEFAULT 'unknown',
  concrete_profile text NOT NULL DEFAULT 'unknown',
  tread_finish_code text,
  riser_finish_code text,
  string_finish_code text,
  ramp_finish_code text,
  nrm_work_section text,
  display_colour text NOT NULL DEFAULT '#7c3aed',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stair_ramp_family_project ON stair_ramp_family(project_id,status);

CREATE TABLE IF NOT EXISTS balustrade_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  material text,
  height_mm double precision,
  finish text,
  display_colour text NOT NULL DEFAULT '#f59e0b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_balustrade_family_project ON balustrade_family(project_id,status);

CREATE TABLE IF NOT EXISTS stair_ramp_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  family_id uuid REFERENCES stair_ramp_family(id) ON DELETE SET NULL,
  rail_family_id uuid REFERENCES balustrade_family(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('stair','ramp')),
  type_mark text,
  name text,
  generated_boundary jsonb NOT NULL DEFAULT '[]'::jsonb,
  outer_boundary jsonb NOT NULL DEFAULT '[]'::jsonb,
  holes jsonb NOT NULL DEFAULT '[]'::jsonb,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_rail_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  rail_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_rail_edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_level_label text,
  end_level_label text,
  rise_mm double precision,
  rise_source text NOT NULL DEFAULT 'unknown',
  width_mm double precision,
  riser_mm double precision,
  tread_mm double precision,
  waist_mm double precision,
  landing_thickness_mm double precision,
  slope_degrees double precision,
  slope_percent double precision,
  construction_type text NOT NULL DEFAULT 'unknown',
  support_condition text NOT NULL DEFAULT 'unknown',
  concrete_profile text NOT NULL DEFAULT 'unknown',
  flight_count int,
  riser_count int,
  tread_count int,
  plan_area_m2 double precision,
  sloping_surface_area_m2 double precision,
  intermediate_landing_area_m2 double precision,
  concrete_volume_m3 double precision,
  formwork_soffit_m2 double precision,
  tread_finish_area_m2 double precision,
  riser_finish_area_m2 double precision,
  string_apron_finish_area_m2 double precision,
  ramp_finish_area_m2 double precision,
  balustrade_length_m double precision,
  quantity_status text NOT NULL DEFAULT 'needs_review',
  reinforcement_status text NOT NULL DEFAULT 'information_required',
  geometry_user_modified boolean NOT NULL DEFAULT false,
  include_in_boq boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  confidence double precision,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(floor_id, source_viewport_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_stair_ramp_instance_project ON stair_ramp_instance(project_id,status);
CREATE INDEX IF NOT EXISTS idx_stair_ramp_instance_floor ON stair_ramp_instance(floor_id,status);

CREATE TABLE IF NOT EXISTS stair_ramp_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES stair_ramp_instance(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  code text,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stair_ramp_review_project ON stair_ramp_review_item(project_id,resolved,severity);
