import type { Point } from "@/features/drawing/types";
import type { FloorDrawing } from "@/features/drawings/types";

export type CeilingScopeState = "new" | "existing_to_remain" | "repair_and_match" | "reuse" | "relocate" | "demolish_remove" | "alternate" | "no_work" | "no_ceiling" | "exposed_structure";
export type CeilingProfileType = "flat" | "stepped" | "sloped" | "varies" | "curved" | "unknown";
export type CeilingSystemType = "applied_finish" | "suspended_gypsum" | "suspended_grid" | "cement_plaster" | "exposed_structure" | "no_ceiling" | "other";
export type CeilingMeasurementBasis = "area" | "length" | "number";

export type CeilingSlopePlane = { area_fraction: number; angle_degrees: number };
export type CeilingProfile = {
  angle_degrees?: number | null;
  rise?: number | null;
  run?: number | null;
  lower_height_mm?: number | null;
  upper_height_mm?: number | null;
  run_length_mm?: number | null;
  direction_degrees?: number | null;
  planes?: CeilingSlopePlane[];
  source?: "user" | "ceiling_plan" | "section" | "elevation" | "unknown";
  needs_confirmation?: boolean;
};

export type CeilingFloor = {
  id: string;
  name: string;
  level_index: number;
  drawing_url: string | null;
  architectural_drawing_url: string | null;
  rcp_drawing_url: string | null;
  coordination_drawings: FloorDrawing[];
  drawing_width: number;
  drawing_height: number;
  mm_per_pixel?: number | null;
  scale_verified: boolean;
  crop_version: number;
  room_version: number;
  ceiling_version: number;
  source_mode: "floor_plan";
  rcp_available: boolean;
  detection_status: string;
  detection_model_id?: string | null;
};

export type CeilingDetectionRun = {
  id: string;
  floor_id: string;
  drawing_id: string;
  revision_id: string;
  provider: string;
  model_id: string;
  source_mode: string;
  status: string;
  metadata: Record<string, unknown>;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type CeilingZoneCandidate = {
  id: string;
  run_id: string;
  floor_id: string;
  class_name: string;
  label?: string | null;
  confidence?: number | null;
  geometry: { points: Point[] };
  source_geometry: { points?: Point[]; prediction_id?: string | null };
  reconciliation: { registration_status?: string | null; rooms?: Array<{ room_id: string; coverage_percent: number }> };
  status: "needs_review" | "accepted" | "rejected" | string;
  rejection_reason?: string | null;
  zone_id?: string | null;
  provider: string;
  model_id: string;
};

export type CeilingLayer = {
  id: string;
  definition_id: string;
  layer_order: number;
  layer_type: string;
  name: string;
  material?: string | null;
  thickness_mm?: number | null;
  layer_count?: number | null;
  finish?: string | null;
  nrm_work_section?: string | null;
  nrm_item?: string | null;
  measurement_unit: string;
  separate_boq_item: boolean;
};

export type CeilingDefinition = {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  system_type: CeilingSystemType;
  material?: string | null;
  finish?: string | null;
  manufacturer?: string | null;
  product_code?: string | null;
  panel_width_mm?: number | null;
  panel_length_mm?: number | null;
  thickness_mm?: number | null;
  layer_count?: number | null;
  grid_type?: string | null;
  suspension_system?: string | null;
  fire_rating?: string | null;
  acoustic_rating?: string | null;
  moisture_rating?: string | null;
  default_waste_percent: number;
  scope_state: CeilingScopeState;
  option_code?: string | null;
  display_colour: string;
  status: string;
  assignment_count: number;
  confidence?: number | null;
  layers: CeilingLayer[];
};

export type CeilingDefinitionPayload = Omit<CeilingDefinition, "id" | "status" | "assignment_count" | "confidence" | "layers">;

export type CeilingZoneRoom = {
  room_id: string;
  room_name?: string | null;
  room_number?: string | null;
  intersection_area_m2?: number | null;
  coverage_percent?: number | null;
  is_primary: boolean;
};

export type CeilingZone = {
  id: string;
  floor_id: string;
  parent_zone_id?: string | null;
  zone_number?: string | null;
  name?: string | null;
  geometry: { points: Point[] };
  geometry_source: string;
  profile_type: CeilingProfileType;
  profile: CeilingProfile;
  height_mm?: number | null;
  underside_level_mm?: number | null;
  support_level_mm?: number | null;
  suspension_depth_mm?: number | null;
  height_source?: string | null;
  gross_area_m2?: number | null;
  deduction_area_m2: number;
  net_area_m2?: number | null;
  surface_area_m2?: number | null;
  scope_state: CeilingScopeState;
  option_code?: string | null;
  include_in_boq: boolean;
  status: string;
  user_confirmed: boolean;
  confidence?: number | null;
  ceiling_version: number;
  assignment_id?: string | null;
  definition_id?: string | null;
  definition_code?: string | null;
  definition_name?: string | null;
  system_type?: CeilingSystemType | null;
  material?: string | null;
  finish?: string | null;
  display_colour?: string | null;
  drawing_tag?: string | null;
  assignment_method?: string | null;
  assignment_confidence?: number | null;
  assignment_status?: string | null;
  assignment_confirmed?: boolean;
  review_required?: boolean;
  rooms: CeilingZoneRoom[];
};

export type CeilingFeatureType = "bulkhead" | "beam" | "soffit" | "isolated_strip" | "upstand" | "cornice" | "cove" | "moulding" | "edge_trim" | "angle_trim" | "shadow_gap" | "fire_barrier" | "service_collar" | "fitting" | "insulation" | "repair" | "access_panel";

export type CeilingFeature = {
  id: string;
  floor_id: string;
  zone_id?: string | null;
  definition_id?: string | null;
  definition_code?: string | null;
  definition_name?: string | null;
  feature_type: CeilingFeatureType;
  name?: string | null;
  geometry: { points?: Point[]; point?: Point; quantity?: number };
  measurement_basis: CeilingMeasurementBasis;
  gross_quantity?: number | null;
  deduction_quantity: number;
  net_quantity?: number | null;
  measurement_unit: string;
  width_mm?: number | null;
  height_mm?: number | null;
  depth_mm?: number | null;
  scope_state: CeilingScopeState;
  option_code?: string | null;
  include_in_boq: boolean;
  status: string;
  user_confirmed: boolean;
  confidence?: number | null;
  ceiling_version: number;
};

export type CeilingOpening = {
  id: string;
  zone_id: string;
  opening_type: string;
  name?: string | null;
  geometry: { points?: Point[] };
  area_m2?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  deduct_from_area: boolean;
};

export type CeilingDevice = {
  id: string;
  zone_id?: string | null;
  device_type: string;
  discipline: string;
  geometry: { point?: Point; points?: Point[] };
  quantity: number;
  action_state: string;
  status: string;
  confidence?: number | null;
};

export type CeilingSource = {
  id: string;
  floor_id?: string | null;
  document_id: string;
  page_number: number;
  region_role: string;
  source_text?: string | null;
  file_name: string;
  preview_url?: string | null;
  confidence?: number | null;
};

export type CeilingEvidence = {
  id: string;
  floor_id?: string | null;
  field_name?: string | null;
  value_text?: string | null;
  source_file_name?: string | null;
  source_page?: number | null;
  source_text?: string | null;
  confidence?: number | null;
  accepted: boolean;
  metadata: CeilingProfile & Record<string, unknown>;
};

export type CeilingQuantity = {
  id: string;
  zone_id?: string | null;
  feature_id?: string | null;
  definition_id?: string | null;
  quantity_kind: string;
  definition_code?: string | null;
  definition_name?: string | null;
  zone_number?: string | null;
  zone_name?: string | null;
  net_quantity: number;
  order_quantity: number;
  measurement_unit: string;
  nrm_work_section: string;
  nrm_item?: string | null;
  scope_state: CeilingScopeState;
  include_in_boq: boolean;
  status: string;
};

export type CeilingHistory = {
  id: string;
  floor_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  reason?: string | null;
  changed_by?: string | null;
  ceiling_version: number;
  created_at: string;
};

export type CeilingRegistration = {
  id: string;
  floor_id: string;
  source_region_id: string;
  file_name: string;
  page_number: number;
  region_role: string;
  transform: Record<string, unknown>;
  anchors: Array<Record<string, unknown>>;
  method: string;
  residual_px?: number | null;
  confidence?: number | null;
  status: string;
  user_confirmed: boolean;
};

export type CeilingState = {
  project: { id: string; name: string };
  floors: CeilingFloor[];
  selected_floor_id?: string | null;
  definitions: CeilingDefinition[];
  symbols: Array<{ id: string; symbol_key: string; label: string; discipline: string; include_in_ceiling_boq: boolean; confidence?: number | null; status: string }>;
  zones: CeilingZone[];
  features: CeilingFeature[];
  openings: CeilingOpening[];
  devices: CeilingDevice[];
  sources: CeilingSource[];
  registrations: CeilingRegistration[];
  evidence: CeilingEvidence[];
  conflicts: Array<Record<string, unknown>>;
  quantities: CeilingQuantity[];
  history: CeilingHistory[];
  detection_runs: CeilingDetectionRun[];
  zone_candidates: CeilingZoneCandidate[];
  summary: { zones: number; features: number; confirmed: number; needs_review: number; unassigned: number; area_m2: number; linear_m: number; number: number };
  active_jobs: Array<{ id: string; task_type: string; status: string }>;
  can_continue: boolean;
};

export type CeilingZoneUpdate = Partial<Pick<CeilingZone, "name" | "profile_type" | "profile" | "height_mm" | "underside_level_mm" | "support_level_mm" | "suspension_depth_mm" | "scope_state" | "option_code" | "include_in_boq">> & { points?: Point[] };

export type CeilingFeaturePayload = {
  zone_id?: string | null;
  definition_id?: string | null;
  feature_type: CeilingFeatureType;
  name?: string | null;
  geometry: { points?: Point[]; point?: Point; quantity?: number };
  measurement_basis: CeilingMeasurementBasis;
  width_mm?: number | null;
  height_mm?: number | null;
  depth_mm?: number | null;
  scope_state: CeilingScopeState;
  option_code?: string | null;
  include_in_boq: boolean;
};
