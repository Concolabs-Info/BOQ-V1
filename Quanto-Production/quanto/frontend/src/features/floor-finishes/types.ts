import type { Point } from "@/features/drawing/types";

export type FinishStatus =
  | "auto_confirmed"
  | "confirmed"
  | "needs_review"
  | "conflict"
  | "unassigned";

export type FinishDefinition = {
  id: string;
  project_id: string;
  original_tag: string | null;
  name: string;
  description: string | null;
  material_category: string | null;
  material: string | null;
  tile_width_mm: number | null;
  tile_length_mm: number | null;
  thickness_mm: number | null;
  colour: string | null;
  display_colour: string;
  surface_finish: string | null;
  pattern: string | null;
  manufacturer: string | null;
  product_code: string | null;
  work_type: "floor_finish";
  nrm_work_section: string;
  nrm_item: string;
  bedding: string | null;
  underlay_reference: string | null;
  internal_external: "internal" | "external" | "both";
  measurement_basis: "auto" | "area" | "linear";
  measurement_unit: string;
  default_waste_percent: number;
  status: "active" | "inactive";
  confidence: number | null;
  assignment_count: number;
};

export type FinishEvidence = {
  id: string;
  evidence_type: string;
  value_text: string | null;
  source_file_name: string | null;
  source_page: number | null;
  source_text: string | null;
  confidence: number | null;
  accepted: boolean;
};

export type FinishAssignment = {
  id: string;
  project_id: string;
  floor_id: string;
  room_id: string;
  zone_id: string | null;
  target_key: string;
  finish_id: string | null;
  status: FinishStatus;
  assignment_method: string;
  confidence: number | null;
  confidence_label: "high" | "medium" | "low";
  gross_area_m2: number | null;
  excluded_area_m2: number;
  net_area_m2: number | null;
  waste_percent: number;
  order_area_m2: number | null;
  tile_count: number | null;
  measurement_basis: "area" | "linear";
  nrm_quantity: number | null;
  measurement_unit: "m²" | "m" | string;
  measurement_reason: string | null;
  review_required: boolean;
  user_confirmed: boolean;
  finish_code: string | null;
  finish_name: string | null;
  finish_description: string | null;
  material_category: string | null;
  material: string | null;
  display_colour: string | null;
  room_name: string | null;
  room_type: string | null;
  room_number: string | null;
  zone_name: string | null;
  zone_number: string | null;
  zone_geometry?: { points?: Point[] };
};

export type FinishZone = {
  id: string;
  floor_id: string;
  room_id: string;
  friendly_number: string;
  name: string;
  geometry: { points: Point[] };
  gross_area_m2: number | null;
  excluded_area_m2: number;
  net_area_m2: number | null;
  status: string;
};

export type FinishRoom = {
  id: string;
  floor_id: string;
  friendly_number: string;
  name: string | null;
  room_type: string | null;
  geometry: { points: Point[] };
  area_m2: number | null;
  space_kind: string;
  include_in_boq: boolean;
  status: string;
  assignments: FinishAssignment[];
  zones: FinishZone[];
  evidence: FinishEvidence[];
};

import type { FloorDrawing } from "@/features/drawings/types";

export type FinishFloor = {
  id: string;
  name: string;
  level_index: number;
  finish_version: number;
  mm_per_pixel: number | null;
  scale_verified: boolean;
  drawing_url: string | null;
  architectural_drawing_url: string | null;
  floor_finish_drawing_url: string | null;
  finish_drawings: FloorDrawing[];
  drawing_width: number;
  drawing_height: number;
};

export type FinishSummary = {
  total: number;
  confirmed: number;
  needs_review: number;
  conflicts: number;
  unassigned: number;
  area_m2: number;
};

export type FloorFinishState = {
  project: { id: string; name: string };
  floors: FinishFloor[];
  selected_floor_id: string | null;
  definitions: FinishDefinition[];
  rooms: FinishRoom[];
  assignments: FinishAssignment[];
  zones: FinishZone[];
  summary: FinishSummary;
  active_jobs: Array<{ id: string; task_type: string; status: string }>;
  can_continue: boolean;
};

export type FinishDefinitionPayload = {
  original_tag?: string | null;
  name: string;
  description?: string | null;
  material_category?: string | null;
  material?: string | null;
  tile_width_mm?: number | null;
  tile_length_mm?: number | null;
  thickness_mm?: number | null;
  colour?: string | null;
  display_colour?: string;
  surface_finish?: string | null;
  pattern?: string | null;
  manufacturer?: string | null;
  product_code?: string | null;
  work_type?: "floor_finish";
  nrm_work_section?: string;
  nrm_item?: string;
  bedding?: string | null;
  underlay_reference?: string | null;
  internal_external?: "internal" | "external" | "both";
  measurement_basis?: "auto" | "area" | "linear";
  measurement_unit?: string;
  default_waste_percent?: number;
};
