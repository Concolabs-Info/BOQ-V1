export const DEFAULT_UNIT_TYPES = ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"] as const;

export type RateItemType = "material" | "labour" | "machinery";

export type RateOptionType =
  | "main_item"
  | "material_name"
  | "supplier"
  | "brand"
  | "labour_name"
  | "labour_group"
  | "machinery_name"
  | "machinery_source"
  | "unit_type";

export type RateFile = {
  id: string;
  project_id: string;
  name: string;
  item_count?: number;
  created_at: string;
  updated_at: string;
};

export type MaterialAttributeSelection = {
  attribute: string;
  value: string;
};

export type MaterialAttributeValue = {
  id: string;
  attribute_id: string;
  value: string;
  created_at: string;
};

export type MaterialAttribute = {
  id: string;
  project_id: string;
  material_name: string;
  name: string;
  values: MaterialAttributeValue[];
  created_at: string;
};

export type RateItem = {
  id: string;
  rate_file_id: string;
  project_id: string;
  item_type: RateItemType;
  main_item: string;
  material_name: string | null;
  supplier: string | null;
  brand: string | null;
  material_attributes: MaterialAttributeSelection[];
  labour_name: string | null;
  labour_group: string | null;
  machinery_name: string | null;
  machinery_source: string | null;
  unit_type: string;
  unit_detail: string | null;
  rate: number;
  created_at: string;
  updated_at: string;
};

export type RateItemInput = {
  item_type: RateItemType;
  main_item: string;
  material_name: string | null;
  supplier: string | null;
  brand: string | null;
  material_attributes: MaterialAttributeSelection[];
  labour_name: string | null;
  labour_group: string | null;
  machinery_name: string | null;
  machinery_source: string | null;
  unit_type: string;
  unit_detail: string | null;
  rate: number;
};

export type RateOptions = Record<RateOptionType, string[]>;

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

export const RATE_ITEM_TYPE_LABELS: Record<RateItemType, string> = {
  material: "Material",
  labour: "Labour",
  machinery: "Machinery",
};

export const RATE_OPTION_LABELS: Record<RateOptionType, string> = {
  main_item: "main item",
  material_name: "material name",
  supplier: "supplier",
  brand: "brand",
  labour_name: "name",
  labour_group: "group",
  machinery_name: "name",
  machinery_source: "source",
  unit_type: "unit type",
};
