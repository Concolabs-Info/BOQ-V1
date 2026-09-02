export type Stage = "upload" | "plans" | "scale" | "height" | "specifications" | "start";
export type Id = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Project {
  id: Id;
  name: string;
  pre_status: string;
  frame_version?: number;
  frozen_at?: string | null;
  created_at?: string;
}

export interface DocumentRow {
  id: Id;
  filename: string;
  page_count?: number | null;
  status: string;
  progress?: number;
  size_bytes?: number | null;
  sha256?: string | null;
  error_message?: string | null;
  created_at?: string;
}

export interface PageRow {
  id: Id;
  document_id: Id;
  page_number: number;
  width_pt: number;
  height_pt: number;
  rotation?: number;
  thumbnail_render_id?: Id | null;
  working_render_id?: Id | null;
  working_width_px?: number | null;
  working_height_px?: number | null;
  working_page_from_image?: number[] | null;
}

export interface Sheet {
  id: Id;
  page_id: Id;
  sheet_no?: string | null;
  title?: string | null;
  revision?: string | null;
  discipline?: string | null;
  disciplines?: string[];
  title_block_scale?: JsonValue;
  included: boolean;
  crop_version?: number;
  page_number: number;
  width_pt: number;
  height_pt: number;
  thumbnail_render_id?: Id | null;
  working_render_id?: Id | null;
  status: string;
}

export interface ScaleEvidenceLine {
  usable?: boolean;
  text?: string;
  reason?: string;
  proposed_norm?: number[];
  deviation_from_printed?: number;
}

export interface ScaleChecks {
  recommendation?: string;
  confirmed_factor?: number;
  confirmed_axis?: string;
  anisotropy_refused?: boolean;
  auto_confirmable?: boolean;
  printed?: { factor?: number; note?: { text?: string }; source?: "viewport" | "title_block" | "missing" };
  x?: ScaleEvidenceLine;
  y?: ScaleEvidenceLine;
  roundness?: { sample_count?: number; score?: number };
  calibration?: JsonObject;
  [key: string]: unknown;
}

export interface ScaleFit {
  id: Id;
  viewport_id: Id;
  method: string;
  factor_x?: number | string | null;
  factor_y?: number | string | null;
  anisotropy_ratio?: number | string | null;
  checks?: ScaleChecks;
  status: string;
  crop_version: number;
  scale_version?: number;
  created_at?: string;
}

export interface Viewport {
  id: Id;
  sheet_id: Id;
  parent_viewport_id?: Id | null;
  page_id: Id;
  name: string;
  discipline: string;
  view_kind: string;
  subjects: string[];
  bbox_mpt: number[];
  bbox_norm?: number[] | null;
  level_label?: string | null;
  stated_scale?: JsonValue;
  relevant: boolean;
  why: string;
  status: string;
  crop_version: number;
  sheet_no?: string | null;
  sheet_title?: string | null;
  title_block_scale?: JsonValue;
  included: boolean;
  page_number: number;
  width_pt: number;
  height_pt: number;
  working_render_id?: Id | null;
  working_width_px?: number | null;
  working_height_px?: number | null;
  working_page_from_image?: number[] | null;
  confirmed: boolean;
  scale?: ScaleFit | null;
  latest_scale?: ScaleFit | null;
  scale_confirmed: boolean;
  scale_stale: boolean;
  scale_eligible: boolean;
  scale_required: boolean;
  detected_scale_factor?: number | null;
  detected_scale_source?: "viewport" | "title_block" | "missing";
}

export interface HeightBandEvidence {
  flagged?: boolean;
  measured_mm?: number;
  printed_mm?: number | null;
  agreement?: number | null;
  label?: string | null;
  height_text?: string | null;
  [key: string]: unknown;
}

export interface HeightEvidence {
  primary?: HeightBandEvidence;
  supporting?: HeightBandEvidence | null;
  supporting_delta?: number | null;
  supporting_flagged?: boolean;
  [key: string]: unknown;
}

export interface Storey {
  id: Id;
  project_id: Id;
  name: string;
  level_index: number;
  height_mm?: number | null;
  typical_group?: string | null;
  source_viewport_id?: Id | null;
  height_source_viewport_id?: Id | null;
  height_y_top?: number | null;
  height_y_bottom?: number | null;
  height_basis?: string | null;
  height_evidence?: HeightEvidence;
  status: string;
}

export interface SpecTable {
  columns?: string[];
  rows?: string[][];
  [key: string]: JsonValue | undefined;
}

export interface SpecItem {
  id: Id;
  project_id: Id;
  viewport_id?: Id | null;
  page_id?: Id | null;
  kind: string;
  name: string;
  topic?: string | null;
  raw_text: string;
  table_json?: SpecTable | null;
  bbox_mpt?: number[] | null;
  bbox_norm?: number[] | null;
  found: boolean;
  status: string;
  confirmed: boolean;
}


export interface Confirmation {
  id: Id;
  entity_type: string;
  entity_id: Id;
  content_hash: string;
  actor: string;
  confirmed_at: string;
}

export interface ScaleSetResponse {
  scale_fit: ScaleFit;
  confirmation: Confirmation;
}

export interface HeightCandidate {
  id: Id;
  name: string;
  view_kind: "section" | "elevation" | string;
  sheet_no?: string | null;
  title?: string | null;
  page_number: number;
  crop_version: number;
  scale_confirmed: boolean;
  scale_factor?: number | null;
  crop_span_mm?: number | null;
}

export interface HeightSuggestionResponse {
  storeys: Storey[];
  unresolved_storey_ids: Id[];
}

export interface ReadinessIssue {
  stage: Stage | string;
  message: string;
  entity_id?: Id;
}

export interface PreState {
  project: Project;
  documents: DocumentRow[];
  pages: PageRow[];
  sheets: Sheet[];
  viewports: Viewport[];
  storeys: Storey[];
  spec_items: SpecItem[];
  confirmations: {
    sheet_set: boolean;
    storey_stack: boolean;
    height_stack: boolean;
  };
  readiness: {
    ready: boolean;
    issues: ReadinessIssue[];
  };
}

export interface ProjectFrame {
  schema_version: "project-frame-v1";
  project: { id: Id; name: string };
  frame_version: number;
  created_at: string;
  coordinate_contract: JsonObject;
  source_documents: JsonObject[];
  sheets: JsonObject[];
  viewports: JsonObject[];
  levels: JsonObject[];
  spec_items: JsonObject[];
  transforms: JsonObject[];
}
