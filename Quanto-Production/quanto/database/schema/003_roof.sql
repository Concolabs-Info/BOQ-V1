CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roof production extension. Existing Pre / Floor / Ceiling tables are untouched.
DO $$
BEGIN
  ALTER TABLE takeoff_ui_state DROP CONSTRAINT IF EXISTS takeoff_ui_state_module_check;
  ALTER TABLE takeoff_ui_state
    ADD CONSTRAINT takeoff_ui_state_module_check CHECK (module IN ('floor','ceiling','roof'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS roof_level (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  host_floor_id uuid REFERENCES takeoff_floor(id) ON DELETE SET NULL,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  name text NOT NULL,
  level_text text,
  roof_type text NOT NULL DEFAULT 'unknown',
  scope text NOT NULL DEFAULT 'roof',
  drawing_width int NOT NULL DEFAULT 1,
  drawing_height int NOT NULL DEFAULT 1,
  mm_per_pixel double precision,
  scale_verified boolean NOT NULL DEFAULT false,
  crop_version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, source_viewport_id)
);
CREATE INDEX IF NOT EXISTS idx_roof_level_project ON roof_level(project_id, created_at);

CREATE TABLE IF NOT EXISTS roof_region (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  source_key text,
  name text,
  roof_type text NOT NULL DEFAULT 'unknown',
  level_text text,
  geometry jsonb NOT NULL,
  projected_area_m2 double precision,
  confidence double precision,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(level_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_roof_region_level ON roof_region(level_id);

CREATE TABLE IF NOT EXISTS roof_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  covering_class text NOT NULL DEFAULT 'unknown',
  layers_text text,
  falls_text text,
  nrm_work_section text,
  measurement_unit text NOT NULL DEFAULT 'm²',
  waste_percent double precision NOT NULL DEFAULT 0,
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_roof_definition_project ON roof_definition(project_id, status);

CREATE TABLE IF NOT EXISTS roof_layer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES roof_definition(id) ON DELETE CASCADE,
  layer_order int NOT NULL DEFAULT 0,
  category text NOT NULL,
  code text,
  name text NOT NULL,
  description text,
  material text,
  thickness_mm double precision,
  factor_per_m2 double precision NOT NULL DEFAULT 1,
  measurement_unit text NOT NULL DEFAULT 'm²',
  nrm_work_section text,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_layer_definition ON roof_layer(definition_id, layer_order);

CREATE TABLE IF NOT EXISTS roof_upstand_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  height_mm double precision,
  nrm_work_section text NOT NULL DEFAULT '19',
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS roof_plane (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  region_id uuid REFERENCES roof_region(id) ON DELETE CASCADE,
  definition_id uuid REFERENCES roof_definition(id) ON DELETE SET NULL,
  upstand_definition_id uuid REFERENCES roof_upstand_definition(id) ON DELETE SET NULL,
  source_key text,
  name text,
  surface_type text NOT NULL DEFAULT 'unknown',
  geometry jsonb NOT NULL,
  pitch_value double precision,
  pitch_unit text,
  pitch_degrees double precision,
  slope_direction text,
  projected_area_m2 double precision,
  gross_surface_area_m2 double precision,
  opening_deduction_m2 double precision NOT NULL DEFAULT 0,
  net_surface_area_m2 double precision,
  measurement_status text NOT NULL DEFAULT 'needs_review',
  include_in_boq boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(level_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_roof_plane_level ON roof_plane(level_id, status);
CREATE INDEX IF NOT EXISTS idx_roof_plane_project ON roof_plane(project_id);

CREATE TABLE IF NOT EXISTS roof_edge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  plane_id uuid REFERENCES roof_plane(id) ON DELETE CASCADE,
  source_key text,
  edge_type text NOT NULL DEFAULT 'unknown_roof_boundary',
  geometry jsonb NOT NULL,
  plan_length_m double precision,
  true_length_m double precision,
  upstand_height_mm double precision,
  include_as_upstand boolean NOT NULL DEFAULT false,
  measurement_status text NOT NULL DEFAULT 'measured',
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_edge_level ON roof_edge(level_id, edge_type);

CREATE TABLE IF NOT EXISTS roof_opening (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  plane_id uuid REFERENCES roof_plane(id) ON DELETE CASCADE,
  source_key text,
  opening_type text NOT NULL,
  name text,
  geometry jsonb NOT NULL,
  area_m2 double precision,
  perimeter_m double precision,
  deduct_from_area boolean NOT NULL DEFAULT true,
  count_quantity double precision NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_opening_level ON roof_opening(level_id, opening_type);

CREATE TABLE IF NOT EXISTS roof_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  plane_id uuid REFERENCES roof_plane(id) ON DELETE SET NULL,
  source_key text,
  component_type text NOT NULL,
  name text,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity double precision,
  measurement_unit text,
  nrm_work_section text,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_component_level ON roof_component(level_id, component_type);

CREATE TABLE IF NOT EXISTS roof_structural_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  plane_id uuid REFERENCES roof_plane(id) ON DELETE CASCADE,
  slab_thickness_mm double precision,
  reinforcement_kg_m2 double precision,
  formed_edge_depth_mm double precision,
  formwork_soffit boolean NOT NULL DEFAULT false,
  basis text NOT NULL DEFAULT 'user_entered',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_confirmed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(level_id, plane_id)
);

CREATE TABLE IF NOT EXISTS roof_quantity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES roof_level(id) ON DELETE CASCADE,
  plane_id uuid REFERENCES roof_plane(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  work_section text NOT NULL,
  item_code text,
  description text NOT NULL,
  quantity double precision,
  unit text NOT NULL,
  basis text NOT NULL,
  status text NOT NULL DEFAULT 'measured',
  review_required boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_quantity_project ON roof_quantity(project_id, work_section);

CREATE TABLE IF NOT EXISTS roof_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  level_id uuid REFERENCES roof_level(id) ON DELETE CASCADE,
  entity_type text,
  entity_id uuid,
  severity text NOT NULL DEFAULT 'warning',
  code text,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roof_review_project ON roof_review_item(project_id, resolved, severity);
