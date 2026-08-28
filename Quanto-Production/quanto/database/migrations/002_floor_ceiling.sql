CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Production Takeoff foundation for Floor + Ceiling. Existing Pre tables are untouched.
CREATE TABLE IF NOT EXISTS takeoff_floor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  storey_id uuid REFERENCES storey(id) ON DELETE SET NULL,
  viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  name text NOT NULL,
  level_index int NOT NULL DEFAULT 0,
  typical_factor int NOT NULL DEFAULT 1,
  drawing_width int NOT NULL DEFAULT 1,
  drawing_height int NOT NULL DEFAULT 1,
  mm_per_pixel double precision,
  scale_verified boolean NOT NULL DEFAULT false,
  crop_version int NOT NULL DEFAULT 1,
  room_version int NOT NULL DEFAULT 1,
  finish_version int NOT NULL DEFAULT 1,
  floor_work_version int NOT NULL DEFAULT 1,
  ceiling_version int NOT NULL DEFAULT 1,
  analysis_status text NOT NULL DEFAULT 'not_started',
  analysis_model_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, storey_id)
);
CREATE INDEX IF NOT EXISTS idx_takeoff_floor_project ON takeoff_floor(project_id, level_index);

CREATE TABLE IF NOT EXISTS floor_space (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  friendly_number text NOT NULL,
  name text,
  raw_label text,
  room_type text,
  environment text NOT NULL DEFAULT 'internal',
  space_kind text NOT NULL DEFAULT 'internal',
  geometry jsonb NOT NULL,
  generated_geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  area_m2 double precision,
  perimeter_m double precision,
  confidence double precision,
  status text NOT NULL DEFAULT 'needs_review',
  geometry_status text NOT NULL DEFAULT 'detected',
  include_in_boq boolean NOT NULL DEFAULT true,
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  open_plan boolean NOT NULL DEFAULT false,
  user_confirmed boolean NOT NULL DEFAULT false,
  geometry_version int NOT NULL DEFAULT 1,
  room_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floor_space_floor ON floor_space(floor_id, friendly_number);

CREATE TABLE IF NOT EXISTS floor_region (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  room_id uuid REFERENCES floor_space(id) ON DELETE CASCADE,
  region_kind text NOT NULL,
  name text,
  geometry jsonb NOT NULL,
  area_m2 double precision,
  classification text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'needs_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floor_region_floor ON floor_region(floor_id, region_kind);

CREATE TABLE IF NOT EXISTS floor_space_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  revision int NOT NULL,
  action text NOT NULL,
  geometry jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floor_revision_room ON floor_space_revision(room_id, revision DESC);

CREATE TABLE IF NOT EXISTS finish_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  original_tag text,
  name text NOT NULL,
  description text,
  material_category text,
  material text,
  tile_width_mm double precision,
  tile_length_mm double precision,
  thickness_mm double precision,
  colour text,
  display_colour text NOT NULL DEFAULT '#64748b',
  surface_finish text,
  pattern text,
  manufacturer text,
  product_code text,
  bedding text,
  underlay_reference text,
  internal_external text NOT NULL DEFAULT 'both',
  measurement_basis text NOT NULL DEFAULT 'auto',
  measurement_unit text NOT NULL DEFAULT 'm²',
  default_waste_percent double precision NOT NULL DEFAULT 0,
  nrm_work_section text NOT NULL DEFAULT '28',
  nrm_item text NOT NULL DEFAULT 'Floor finishes',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, original_tag)
);
CREATE INDEX IF NOT EXISTS idx_finish_definition_project ON finish_definition(project_id, status);

CREATE TABLE IF NOT EXISTS finish_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  friendly_number text NOT NULL,
  name text,
  geometry jsonb NOT NULL,
  gross_area_m2 double precision,
  excluded_area_m2 double precision NOT NULL DEFAULT 0,
  net_area_m2 double precision,
  status text NOT NULL DEFAULT 'needs_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finish_zone_room ON finish_zone(room_id);

CREATE TABLE IF NOT EXISTS finish_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES finish_zone(id) ON DELETE CASCADE,
  finish_id uuid REFERENCES finish_definition(id) ON DELETE SET NULL,
  target_key text NOT NULL,
  status text NOT NULL DEFAULT 'unassigned',
  assignment_method text NOT NULL DEFAULT 'unassigned',
  confidence double precision,
  gross_area_m2 double precision,
  excluded_area_m2 double precision NOT NULL DEFAULT 0,
  net_area_m2 double precision,
  waste_percent double precision NOT NULL DEFAULT 0,
  order_area_m2 double precision,
  measurement_basis text NOT NULL DEFAULT 'area',
  nrm_quantity double precision,
  measurement_unit text NOT NULL DEFAULT 'm²',
  measurement_reason text,
  review_required boolean NOT NULL DEFAULT true,
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_key)
);
CREATE INDEX IF NOT EXISTS idx_finish_assignment_floor ON finish_assignment(floor_id, status);

CREATE TABLE IF NOT EXISTS floor_work_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text,
  work_type text NOT NULL,
  name text NOT NULL,
  description text,
  material text,
  manufacturer text,
  product_code text,
  system_type text,
  thickness_mm double precision,
  layer_count int,
  condition text,
  height_mm double precision,
  nrm_work_section text NOT NULL DEFAULT '28',
  nrm_item text,
  measurement_unit text NOT NULL DEFAULT 'm²',
  measurement_basis text NOT NULL DEFAULT 'area',
  default_waste_percent double precision NOT NULL DEFAULT 0,
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floor_work_def_project ON floor_work_definition(project_id, work_type, status);

CREATE TABLE IF NOT EXISTS floor_work_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  name text,
  geometry jsonb NOT NULL,
  gross_area_m2 double precision,
  net_area_m2 double precision,
  status text NOT NULL DEFAULT 'needs_review',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS floor_work_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES floor_work_zone(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  definition_id uuid REFERENCES floor_work_definition(id) ON DELETE SET NULL,
  target_key text NOT NULL,
  coverage_type text NOT NULL DEFAULT 'whole_room',
  measurement_basis text NOT NULL DEFAULT 'area',
  gross_quantity double precision,
  excluded_quantity double precision NOT NULL DEFAULT 0,
  nrm_quantity double precision,
  measurement_unit text NOT NULL DEFAULT 'm²',
  waste_percent double precision NOT NULL DEFAULT 0,
  order_quantity double precision,
  thickness_mm double precision,
  layer_count int,
  upturn_required boolean NOT NULL DEFAULT false,
  upturn_height_mm double precision,
  upturn_area_m2 double precision,
  status text NOT NULL DEFAULT 'unassigned',
  assignment_method text NOT NULL DEFAULT 'rule',
  confidence double precision,
  review_required boolean NOT NULL DEFAULT true,
  user_confirmed boolean NOT NULL DEFAULT false,
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_key)
);
CREATE INDEX IF NOT EXISTS idx_floor_work_assignment_floor ON floor_work_assignment(floor_id, work_type);

CREATE TABLE IF NOT EXISTS skirting_edge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES floor_space(id) ON DELETE CASCADE,
  edge_index int NOT NULL,
  point_a jsonb NOT NULL,
  point_b jsonb NOT NULL,
  length_m double precision NOT NULL DEFAULT 0,
  edge_type text NOT NULL DEFAULT 'skirting',
  reason text,
  user_confirmed boolean NOT NULL DEFAULT false,
  UNIQUE(room_id, edge_index)
);

CREATE TABLE IF NOT EXISTS ceiling_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  description text,
  system_type text NOT NULL DEFAULT 'applied_finish',
  material text,
  finish text,
  manufacturer text,
  product_code text,
  panel_width_mm double precision,
  panel_length_mm double precision,
  thickness_mm double precision,
  layer_count int,
  grid_type text,
  suspension_system text,
  fire_rating text,
  acoustic_rating text,
  moisture_rating text,
  default_waste_percent double precision NOT NULL DEFAULT 0,
  scope_state text NOT NULL DEFAULT 'new',
  option_code text,
  display_colour text NOT NULL DEFAULT '#64748b',
  source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS ceiling_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  parent_zone_id uuid REFERENCES ceiling_zone(id) ON DELETE CASCADE,
  zone_number text,
  name text,
  geometry jsonb NOT NULL,
  geometry_source text NOT NULL DEFAULT 'floor_space',
  profile_type text NOT NULL DEFAULT 'flat',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  height_mm double precision,
  underside_level_mm double precision,
  support_level_mm double precision,
  suspension_depth_mm double precision,
  height_source text,
  gross_area_m2 double precision,
  deduction_area_m2 double precision NOT NULL DEFAULT 0,
  net_area_m2 double precision,
  surface_area_m2 double precision,
  scope_state text NOT NULL DEFAULT 'new',
  option_code text,
  include_in_boq boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  confidence double precision,
  ceiling_version int NOT NULL DEFAULT 1,
  definition_id uuid REFERENCES ceiling_definition(id) ON DELETE SET NULL,
  drawing_tag text,
  assignment_method text,
  assignment_confidence double precision,
  assignment_status text,
  assignment_confirmed boolean NOT NULL DEFAULT false,
  room_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ceiling_zone_floor ON ceiling_zone(floor_id, status);

CREATE TABLE IF NOT EXISTS ceiling_feature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES ceiling_zone(id) ON DELETE SET NULL,
  definition_id uuid REFERENCES ceiling_definition(id) ON DELETE SET NULL,
  feature_type text NOT NULL,
  name text,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  measurement_basis text NOT NULL DEFAULT 'area',
  gross_quantity double precision,
  deduction_quantity double precision NOT NULL DEFAULT 0,
  net_quantity double precision,
  measurement_unit text NOT NULL DEFAULT 'm²',
  width_mm double precision,
  height_mm double precision,
  depth_mm double precision,
  scope_state text NOT NULL DEFAULT 'new',
  option_code text,
  include_in_boq boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'needs_review',
  user_confirmed boolean NOT NULL DEFAULT false,
  confidence double precision,
  ceiling_version int NOT NULL DEFAULT 1,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ceiling_opening (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES ceiling_zone(id) ON DELETE CASCADE,
  opening_type text NOT NULL,
  name text,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  area_m2 double precision,
  width_mm double precision,
  height_mm double precision,
  deduct_from_area boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS takeoff_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  module text NOT NULL,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  entity_type text,
  entity_id uuid,
  evidence_type text NOT NULL,
  value_text text,
  source_document_id uuid REFERENCES document(id) ON DELETE SET NULL,
  source_page int,
  source_viewport_id uuid REFERENCES viewport(id) ON DELETE SET NULL,
  source_text text,
  geometry jsonb,
  confidence double precision,
  accepted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_takeoff_evidence_project ON takeoff_evidence(project_id, module, floor_id);

CREATE TABLE IF NOT EXISTS takeoff_analysis_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  module text NOT NULL,
  task_type text NOT NULL,
  provider text NOT NULL,
  model_id text,
  prompt_version text,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  message text,
  request_hash text,
  result_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_takeoff_run_project ON takeoff_analysis_run(project_id, module, created_at DESC);

CREATE TABLE IF NOT EXISTS takeoff_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES takeoff_floor(id) ON DELETE CASCADE,
  module text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  changed_by text NOT NULL DEFAULT 'user',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_takeoff_history_project ON takeoff_history(project_id, module, created_at DESC);

CREATE TABLE IF NOT EXISTS takeoff_ui_state (
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('floor','ceiling')),
  state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,module)
);
