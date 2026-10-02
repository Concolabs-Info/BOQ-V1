import type { NormItemType } from "@/features/norms/types";

export type RateBreakdownRow = {
  id: string;
  rate_breakdown_item_id: string;
  project_id: string;
  item_type: NormItemType;
  description: string;
  unit: string | null;
  quantity: number;
  rate_item_id: string | null;
  selected_rate_label: string | null;
  selected_rate: number | null;
  amount: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type RateBreakdownSummary = {
  total: number;
  rate_for_unit: number;
  rate_say_unit: number;
  rate_say_unit_label?: string;
  rate_say_ft3: number;
  rate_say_m3: number;
  analysis_quantity: number;
  analysis_unit: string;
};

export type RateBreakdownItem = {
  id: string;
  project_id: string;
  norm_group_id: string | null;
  rate_file_id: string | null;
  main_item_name: string;
  analysis_quantity: number;
  analysis_unit: string;
  rows: RateBreakdownRow[];
  summary: RateBreakdownSummary;
  created_at: string;
  updated_at: string;
};

export type RateBreakdownRowInput = {
  item_type: NormItemType;
  description: string;
  unit: string | null;
  quantity: number;
  rate_item_id: string | null;
  selected_rate_label: string | null;
  selected_rate: number | null;
  sort_order: number;
};

export type RateBreakdownItemInput = {
  norm_group_id: string;
  rate_file_id: string;
  main_item_name: string;
  analysis_quantity: number;
  analysis_unit: string;
  rows: RateBreakdownRowInput[];
};
