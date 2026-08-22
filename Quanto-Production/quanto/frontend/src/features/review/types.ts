export type ReviewItem = {
  id: string;
  project_id: string;
  floor_id: string;
  entity_type: "door" | "window" | "column" | "beam" | "slab" | "stair" | "wall" | "floor" | "floor_finish" | "wall_finish" | "floor_drawing" | "ceiling_zone" | "roof_plane" | "roof_edge" | "roof_opening" | "masonry_takeoff" | "floor_area_control" | "workbook_assumption" | `roof_component_${string}` | `ceiling_feature_${string}` | `floor_work_${string}`;
  entity_id: string;
  display_number: string | null;
  title: string;
  data: Record<string, unknown>;
  status: "ready" | "needs_review" | "confirmed";
  critical: boolean;
  is_stale: boolean;
  source_version: number;
  review_version: number;
};
export type ReviewFloorSummary = { id: string; name: string; level_index: number; total: number; confirmed: number; ready: number; needs_review: number };
export type ReviewState = {
  project_id: string;
  floors: ReviewFloorSummary[];
  counts: Record<string, number>;
  items: ReviewItem[];
  stale?: boolean;
  active_jobs?: Array<{ id: string; task_type: string; status: string }>;
};
