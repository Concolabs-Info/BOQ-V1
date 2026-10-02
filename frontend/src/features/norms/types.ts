export type NormItemType = "material" | "labor" | "machinery" | "percentage";

export type NormOptionType = "norm_material_unit" | "norm_labor_unit" | "norm_machinery_unit";

export type NormItem = {
  id: string;
  project_id: string;
  norm_group_id: string;
  item_type: NormItemType;
  name: string;
  quantity: number;
  unit: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type NormChildInput = {
  item_type: NormItemType;
  name: string;
  quantity: number;
  unit: string | null;
};

export type NormComposition = {
  id: string;
  project_id: string;
  main_item_name: string;
  items: NormItem[];
  created_at: string;
  updated_at: string;
};

export type NormCompositionInput = {
  main_item_name: string;
  items: NormChildInput[];
};

export type NormOptions = Record<NormOptionType, string[]>;

export const NORM_ITEM_TYPE_LABELS: Record<NormItemType, string> = {
  material: "Material",
  labor: "Labor",
  machinery: "Machinery",
  percentage: "Percentage",
};

export const NORM_UNIT_OPTION_BY_TYPE: Record<Exclude<NormItemType, "percentage">, NormOptionType> = {
  material: "norm_material_unit",
  labor: "norm_labor_unit",
  machinery: "norm_machinery_unit",
};

export const DEFAULT_NORM_UNITS: Record<Exclude<NormItemType, "percentage">, string[]> = {
  material: ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"],
  labor: ["minute", "hour", "day"],
  machinery: ["hour", "day", "shift", "trip"],
};
