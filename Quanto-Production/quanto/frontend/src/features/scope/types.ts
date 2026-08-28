export type ScopeStatus = "ready" | "partial" | "blocked";

export interface ScopeScale {
  status: "confirmed" | "locked";
  scale_fit_id?: string | null;
  factor?: number | null;
  factor_x?: number | null;
  factor_y?: number | null;
}

export interface ScopeViewport {
  viewport_id: string;
  role: string;
  level_ref?: string | null;
  scope_ref: string;
  name?: string | null;
  sheet_no?: string | null;
  sheet_title?: string | null;
  discipline?: string | null;
  view_kind?: string | null;
  subjects: string[];
  level_label?: string | null;
  selection_basis: string;
  sheet_revision?: string | null;
  scale: ScopeScale;
  source_transform?: {
    page_id?: string | null;
    render_id?: string | null;
    width_px?: number | null;
    height_px?: number | null;
    page_from_image?: unknown;
    status: "confirmed" | "missing";
  };
  spatial_alignment?: "level_mapped_only" | "not_established" | string;
}

export interface ScopeGap {
  code: string;
  scope_ref: string;
  severity: "blocked" | "hold" | "warning" | string;
  message: string;
  entity_refs?: string[];
}

export interface ScopeHold {
  code: string;
  scope_ref: string;
  fact_type?: string;
  publisher_element?: string;
  status?: string;
  message: string;
}

export interface ScopeQuestionOption {
  value: string;
  label: string;
}

export interface ScopeQuestion {
  id: string;
  scope_ref: string;
  code: string;
  kind: "guidance" | "single_choice" | "anomaly" | "dependency";
  prompt: string;
  effect: string;
  options: ScopeQuestionOption[];
  entity_refs: string[];
  status: "open" | "answered" | "dismissed";
  answer?: Record<string, unknown> | null;
}

export interface ScopeManifest {
  schema_version: string;
  project_id: string;
  element: string;
  label: string;
  frame_version: number;
  generated_at: string;
  status: ScopeStatus;
  selected_viewports: ScopeViewport[];
  level_scopes: Array<{
    scope_ref: string;
    level_ref?: string | null;
    connected_level_refs?: string[];
    label?: string | null;
    primary_viewport_ids: string[];
    geometry_route: string;
    vertical_coverage?: { status: "mapped" | "general" | "missing"; viewport_ids: string[] };
    consumed_facts?: Array<{ fact_type: string; publisher_element: string; required: boolean; status: string }>;
  }>;
  supporting_spec_items: Array<Record<string, unknown>>;
  consumed_facts: Array<Record<string, unknown>>;
  coverage_gaps: ScopeGap[];
  holds: ScopeHold[];
  summary: {
    primary_count: number;
    supporting_count: number;
    level_scope_count: number;
    gap_count: number;
    hold_count: number;
  };
  manifest_id: string;
  run_revision: number;
  stale: boolean;
  questions: ScopeQuestion[];
}
