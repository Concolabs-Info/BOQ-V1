import type { Point } from "@/features/drawing/types";

export type FloorWorkType =
  | "screed"
  | "waterproofing"
  | "underlay"
  | "board_insulation"
  | "quilt_insulation"
  | "isolation_membrane"
  | "sealer"
  | "skirting";

export type FloorWorkStatus =
  | "auto_confirmed"
  | "confirmed"
  | "needs_review"
  | "conflict"
  | "unassigned"
  | "not_required";

export type FloorWorkDefinition = {
  id: string;
  project_id: string;
  code: string | null;
  work_type: FloorWorkType;
  name: string;
  description: string | null;
  material: string | null;
  manufacturer: string | null;
  product_code: string | null;
  system_type: string | null;
  thickness_mm: number | null;
  layer_count: number | null;
  condition: string | null;
  height_mm: number | null;
  nrm_work_section: string;
  nrm_item: string | null;
  measurement_unit: string;
  measurement_basis: "area" | "linear";
  default_waste_percent: number;
  display_colour: string;
  status: "active" | "inactive";
  confidence: number | null;
  assignment_count: number;
};

export type FloorWorkDefinitionPayload = {
  code?: string | null;
  work_type: FloorWorkType;
  name: string;
  description?: string | null;
  material?: string | null;
  manufacturer?: string | null;
  product_code?: string | null;
  system_type?: string | null;
  thickness_mm?: number | null;
  layer_count?: number | null;
  condition?: string | null;
  height_mm?: number | null;
  default_waste_percent?: number;
  display_colour?: string;
};

export type FloorWorkAssignment = {
  id: string;
  project_id: string;
  floor_id: string;
  room_id: string;
  zone_id: string | null;
  target_key: string;
  work_type: FloorWorkType;
  definition_id: string | null;
  definition_code: string | null;
  definition_name: string | null;
  definition_description: string | null;
  display_colour: string | null;
  coverage_type: "whole_room" | "selected_zone" | "finish_zone";
  measurement_basis: "area" | "linear";
  gross_quantity: number | null;
  excluded_quantity: number;
  nrm_quantity: number | null;
  measurement_unit: string;
  waste_percent: number;
  order_quantity: number | null;
  thickness_mm: number | null;
  layer_count: number | null;
  upturn_required: boolean;
  upturn_height_mm: number | null;
  upturn_area_m2: number | null;
  status: FloorWorkStatus;
  assignment_method: string;
  confidence: number | null;
  review_required: boolean;
  user_confirmed: boolean;
  source_page: number | null;
  source_text: string | null;
};

export type FloorWorkMeasurement = {
  room_id: string;
  area_m2: number | null;
  gross_perimeter_m: number | null;
  door_deduction_m: number;
  manual_edge_deduction_m: number;
  net_skirting_length_m: number | null;
  measurement_status: "ready" | "needs_review";
};

export type SkirtingEdge = {
  id: string;
  edge_index: number;
  point_a: Point;
  point_b: Point;
  length_m: number;
  edge_type: "skirting" | "no_skirting" | "door_opening" | "built_in_furniture" | "full_height_finish" | "unknown";
  reason: string | null;
  user_confirmed: boolean;
};

export type FloorWorkZone = {
  id: string;
  floor_id: string;
  room_id: string;
  work_type: FloorWorkType;
  name: string | null;
  geometry: { points: Point[] };
  gross_area_m2: number | null;
  net_area_m2: number | null;
  status: string;
};

export type FloorWorkEvidence = {
  id: string;
  room_id: string | null;
  assignment_id: string | null;
  evidence_type: string;
  value_text: string | null;
  source_page: number | null;
  source_text: string | null;
  confidence: number | null;
  accepted: boolean;
};

export type FloorWorkRoom = {
  id: string;
  floor_id: string;
  friendly_number: string;
  name: string | null;
  room_type: string | null;
  geometry: { points: Point[] };
  display_polygon?: { points: Point[] };
  area_m2: number | null;
  geometry_status: string;
  source_evidence?: Array<{ kind: string; text?: string | null; confidence?: number; support_ratio?: number; wall_overlap_ratio?: number }>;
  assignments: FloorWorkAssignment[];
  zones: FloorWorkZone[];
  evidence: FloorWorkEvidence[];
  measurement: FloorWorkMeasurement | null;
  skirting_edges: SkirtingEdge[];
};

export type FloorWorkState = {
  project: { id: string; name: string };
  floors: Array<{
    id: string;
    name: string;
    level_index: number;
    floor_work_version: number;
    mm_per_pixel: number | null;
    scale_verified: boolean;
    drawing_url: string | null;
    drawing_width: number;
    drawing_height: number;
  }>;
  selected_floor_id: string | null;
  work_types: FloorWorkType[];
  definitions: FloorWorkDefinition[];
  rooms: FloorWorkRoom[];
  measurements: FloorWorkMeasurement[];
  assignments: FloorWorkAssignment[];
  zones: FloorWorkZone[];
  evidence: FloorWorkEvidence[];
  summary: {
    total: number;
    confirmed: number;
    needs_review: number;
    conflicts: number;
    unassigned: number;
    area_m2: number;
    linear_m: number;
    measurement_issues: number;
  };
  active_jobs: Array<{ id: string; task_type: string; status: string; progress?: number; message?: string }>;
  needs_automatic_sync: boolean;
  can_continue: boolean;
};
