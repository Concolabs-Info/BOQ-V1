CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Walls production extension. Existing module tables remain untouched.
DO $$
BEGIN
  ALTER TABLE takeoff_ui_state DROP CONSTRAINT IF EXISTS takeoff_ui_state_module_check;
  ALTER TABLE takeoff_ui_state
    ADD CONSTRAINT takeoff_ui_state_module_check CHECK (module IN ('floor','ceiling','roof','walls'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS wall_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  wall_kind text NOT NULL DEFAULT 'unknown',
  classification text NOT NULL DEFAULT 'unknown',
  material text,
  thickness_mm double precision,
  height_mm double precision,
  construction text,
  structural_role text NOT NULL DEFAULT 'unknown',
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
CREATE INDEX IF NOT EXISTS idx_wall_definition_project ON wall_definition(project_id,status);

CREATE TABLE IF NOT EXISTS wall_finish_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  material text,
  thickness_mm double precision,
  internal_external text NOT NULL DEFAULT 'both',
  coverage_mode text NOT NULL DEFAULT 'full_height',
  coverage_height_mm double precision,
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_wall_finish_definition_project ON wall_finish_definition(project_id,status);

CREATE TABLE IF NOT EXISTS wall_finish_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  room_types text[] NOT NULL DEFAULT '{}',
  finish_codes text[] NOT NULL DEFAULT '{}',
  side_scope text NOT NULL DEFAULT 'room_face',
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_text text,
  confidence double precision,
  source text NOT NULL DEFAULT 'ai_catalog',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wall_finish_rule_project ON wall_finish_rule(project_id,status);

CREATE TABLE IF NOT EXISTS wall_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  source_key text,
  definition_id uuid REFERENCES wall_definition(id) ON DELETE SET NULL,
  generated_centerline jsonb NOT NULL DEFAULT '[]'::jsonb,
  centerline jsonb NOT NULL DEFAULT '[]'::jsonb,
  wall_kind text NOT NULL DEFAULT 'unknown',
  classification text NOT NULL DEFAULT 'unknown',
  thickness_mm double precision,
  height_mm double precision,
  height_source text NOT NULL DEFAULT 'unknown',
  length_m double precision,
  gross_area_m2 double precision,
  opening_deduction_m2 double precision NOT NULL DEFAULT 0,
  net_area_m2 double precision,
  adjacent_space_a text,
  adjacent_space_b text,
  side_a_finish_id uuid REFERENCES wall_finish_definition(id) ON DELETE SET NULL,
  side_b_finish_id uuid REFERENCES wall_finish_definition(id) ON DELETE SET NULL,
  side_a_room_id uuid REFERENCES floor_space(id) ON DELETE SET NULL,
  side_b_room_id uuid REFERENCES floor_space(id) ON DELETE SET NULL,
  include_in_boq boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  confidence double precision,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(floor_id, source_viewport_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_wall_instance_floor ON wall_instance(floor_id,status);
CREATE INDEX IF NOT EXISTS idx_wall_instance_project ON wall_instance(project_id,status);

CREATE TABLE IF NOT EXISTS wall_opening_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  wall_id uuid NOT NULL REFERENCES wall_instance(id) ON DELETE CASCADE,
  source_key text,
  opening_tag text,
  opening_type text NOT NULL DEFAULT 'unknown',
  center jsonb NOT NULL DEFAULT '{}'::jsonb,
  width_mm double precision,
  height_mm double precision,
  gross_area_m2 double precision,
  deduction_area_m2 double precision NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'plan_schedule',
  confidence double precision,
  status text NOT NULL DEFAULT 'needs_review',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wall_id,source_key)
);
CREATE INDEX IF NOT EXISTS idx_wall_opening_wall ON wall_opening_link(wall_id);

CREATE TABLE IF NOT EXISTS wall_face_finish (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  wall_id uuid NOT NULL REFERENCES wall_instance(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('A','B')),
  finish_id uuid NOT NULL REFERENCES wall_finish_definition(id) ON DELETE CASCADE,
  room_id uuid REFERENCES floor_space(id) ON DELETE SET NULL,
  coverage_mode text NOT NULL DEFAULT 'full_height',
  coverage_height_mm double precision,
  gross_area_m2 double precision,
  opening_deduction_m2 double precision NOT NULL DEFAULT 0,
  net_area_m2 double precision,
  assignment_method text NOT NULL DEFAULT 'unassigned',
  confidence double precision,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wall_id,side,finish_id)
);
CREATE INDEX IF NOT EXISTS idx_wall_face_finish_project ON wall_face_finish(project_id,finish_id);

CREATE TABLE IF NOT EXISTS wall_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  wall_id uuid REFERENCES wall_instance(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  code text,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wall_review_project ON wall_review_item(project_id,resolved,severity);
