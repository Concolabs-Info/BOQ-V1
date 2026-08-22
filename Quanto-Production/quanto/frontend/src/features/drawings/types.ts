import type { FloorCropSaveInput, FloorPlanDocument, FloorPlanJob } from "@/features/floor-plans/types";

export type DrawingType =
  | "reflected_ceiling_plan" | "floor_finish_plan" | "wall_finish_plan" | "electrical_plan"
  | "lighting_plan" | "hvac_plan" | "fire_plan" | "plumbing_plan" | "structural_plan"
  | "roof_plan" | "roof_framing_plan" | "roof_terrace_plan" | "roof_deck_plan"
  | "site_plan" | "section_detail" | "elevation" | "other";

export type DrawingTypeOption = { key: DrawingType; label: string; discipline: string; consumer: string };

export type DrawingRegistration = {
  registration_id?: string | null;
  transform?: { matrix?: number[] };
  anchors?: Array<Record<string, unknown>>;
  registration_method?: string | null;
  residual_px?: number | null;
  registration_confidence?: number | null;
  registration_status?: string | null;
  user_confirmed?: boolean;
};

export type FloorDrawing = DrawingRegistration & {
  id: string;
  project_id: string;
  floor_id: string;
  drawing_type: DrawingType;
  slot_key: string;
  name: string;
  discipline: string;
  consumer: string;
  status: string;
  drawing_version: number;
  revision_id?: string | null;
  revision_number?: number | null;
  revision_status?: string | null;
  extraction_status?: string | null;
  document_id?: string | null;
  document_page_id?: string | null;
  source_page_number?: number | null;
  file_name?: string | null;
  original_page_width?: number | null;
  original_page_height?: number | null;
  rotation?: 0 | 90 | 180 | 270;
  render_dpi?: number;
  coordinates?: { original_rect?: { x: number; y: number; width: number; height: number }; normalized_display_rect?: { x: number; y: number; width: number; height: number } };
  crop_asset_url?: string | null;
  preview_asset_url?: string | null;
  revisions: Array<Record<string, unknown>>;
  specification_links: Array<{ source_id: string; source_kind: string; file_name?: string | null; category?: string | null; link_method: string }>;
  source_document?: FloorPlanDocument | null;
};

export type DrawingState = { drawings: FloorDrawing[]; drawing_types: DrawingTypeOption[]; specification_links: Array<Record<string, unknown>> };
export type DrawingCropInput = FloorCropSaveInput;
export type DrawingSourceUploadResult = { document: FloorPlanDocument; drawing_id: string; reused: boolean; duplicate: boolean; jobs: FloorPlanJob[] };
