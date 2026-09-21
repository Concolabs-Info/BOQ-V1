export const DEFAULT_UNIT_TYPES = ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"] as const;
export const DEFAULT_SPECIFICATIONS = ["Grade C25/30"] as const;

export type RateOptionType = "unit_type" | "specification";

export type RateFile = {
  id: string;
  project_id: string;
  name: string;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type RateItem = {
  id: string;
  rate_file_id: string;
  project_id: string;
  material_name: string;
  specification: string | null;
  size: string | null;
  unit_cost: number;
  markup_percent: number;
  unit_type: string;
  custom_unit: string | null;
  created_at: string;
  updated_at: string;
};

export type RateItemInput = {
  material_name: string;
  specification: string | null;
  size: string | null;
  unit_cost: number;
  markup_percent: number;
  unit_type: string;
  custom_unit: string | null;
};

export type RateOptions = {
  unit_type: string[];
  specification: string[];
};

export const UNIT_TYPE_LABELS: Record<string, string> = {
  m: "m",
  m2: "m2",
  m3: "m3",
  nr: "nr",
  kg: "kg",
  ton: "ton",
  bag: "bag",
  sheet: "sheet",
  litre: "litre",
};
