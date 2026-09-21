import type { RateItem } from "@/features/rate-files/types";
import type { BoqRow } from "./types";

export type RateMatchStatus = "auto_applied" | "suggested" | "conflict" | "unmatched" | "manual";

export type RateMatchCandidate = {
  item: RateItem;
  score: number;
  reasons: string[];
  sellRate: number;
};

export type RateMatchResult = {
  rowId: string;
  rowSignature: string;
  status: RateMatchStatus;
  appliedItem: RateItem | null;
  candidates: RateMatchCandidate[];
  score: number;
  reason: string;
};

export type RememberedRateMapping = {
  row_signature: string;
  rate_item_id: string;
  source: "auto" | "manual" | "suggested";
  status: "applied" | "suggested" | "conflict" | "unmatched";
  score: number;
};

const UNIT_ALIASES: Record<string, string> = {
  "m": "m",
  "lm": "m",
  "linear metre": "m",
  "linear meter": "m",
  "m2": "m2",
  "m²": "m2",
  "sqm": "m2",
  "sq m": "m2",
  "m3": "m3",
  "m³": "m3",
  "cum": "m3",
  "cu m": "m3",
  "nr": "nr",
  "no": "nr",
  "nos": "nr",
  "each": "nr",
  "ea": "nr",
  "item": "nr",
  "kg": "kg",
  "ton": "ton",
  "tonne": "ton",
  "bag": "bag",
  "sheet": "sheet",
  "litre": "litre",
  "liter": "litre",
};

const STOP_WORDS = new Set(["and", "the", "to", "of", "for", "with", "in", "on", "a", "an", "including"]);

export function normalizeUnit(unit: string | null | undefined): string | null {
  const key = String(unit || "").trim().toLowerCase().replace(/\./g, "");
  return UNIT_ALIASES[key] || key || null;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[×x*]/g, " x ")
    .replace(/m²/g, "m2")
    .replace(/m³/g, "m3")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hasMaterialNameMatch(rowText: string, materialName: string | null | undefined) {
  const materialTokens = tokens(materialName);
  if (!materialTokens.length) return false;
  const rowTokens = new Set(tokens(rowText));
  return materialTokens.every((token) => rowTokens.has(token));
}

function compactSize(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/\s*x\s*/g, "x")
    .replace(/\s+/g, "");
}

function hasExactSizeMatch(rowText: string, value: string | null | undefined) {
  const needle = compactSize(value);
  if (!needle) return false;
  return compactSize(rowText).includes(needle);
}

export function sellRate(item: RateItem) {
  return Number((item.unit_cost * (1 + item.markup_percent / 100)).toFixed(2));
}

export function rowSignature(row: BoqRow) {
  const unit = normalizeUnit(row.unit) || normalizeText(row.unit) || "unit";
  const terms = tokens(`${row.item_code || ""} ${row.description}`).slice(0, 14).join("-");
  return [unit, normalizeText(row.item_code || ""), terms].filter(Boolean).join("|");
}

export function exactRateItemMatch(row: BoqRow, item: RateItem): RateMatchCandidate | null {
  const rowUnit = normalizeUnit(row.unit);
  const itemUnit = normalizeUnit(item.unit_type);
  if (!rowUnit || !itemUnit || rowUnit !== itemUnit) return null;

  const reasons = ["Unit match"];
  const rowText = normalizeText(`${row.item_code || ""} ${row.section || ""} ${row.description}`);

  if (!hasMaterialNameMatch(rowText, item.material_name)) return null;
  reasons.push("Material name match");

  if (!item.size || !hasExactSizeMatch(rowText, item.size)) return null;
  reasons.push("Size exact match");

  return { item, score: 100, reasons, sellRate: sellRate(item) };
}

export function matchBoqRow(row: BoqRow, items: RateItem[], remembered: RememberedRateMapping[] = []): RateMatchResult {
  const signature = rowSignature(row);
  const rememberedMapping = remembered.find((mapping) => mapping.source === "manual" && mapping.row_signature === signature);
  const rememberedItem = rememberedMapping ? items.find((item) => item.id === rememberedMapping.rate_item_id) || null : null;
  if (rememberedMapping && rememberedItem) {
    return {
      rowId: row.id,
      rowSignature: signature,
      status: "manual",
      appliedItem: rememberedItem,
      candidates: [{ item: rememberedItem, score: rememberedMapping.score || 100, reasons: ["Remembered manual mapping"], sellRate: sellRate(rememberedItem) }],
      score: rememberedMapping.score || 100,
      reason: "Remembered manual mapping",
    };
  }

  const candidates = items
    .map((item) => exactRateItemMatch(row, item))
    .filter((value): value is RateMatchCandidate => Boolean(value))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return { rowId: row.id, rowSignature: signature, status: "unmatched", appliedItem: null, candidates, score: 0, reason: "No exact rate item match" };
  }
  const second = candidates[1];
  if (second) {
    return { rowId: row.id, rowSignature: signature, status: "conflict", appliedItem: null, candidates, score: best.score, reason: "Multiple exact matches" };
  }
  return { rowId: row.id, rowSignature: signature, status: "auto_applied", appliedItem: best.item, candidates, score: best.score, reason: best.reasons.join(", ") };
}

export function applyRateToRow(row: BoqRow, item: RateItem): Partial<BoqRow> {
  const rate = sellRate(item);
  return {
    rate,
    amount: Number((row.quantity * rate).toFixed(2)),
    status: "ready",
    missing_fields: row.missing_fields.filter((field) => field !== "rate"),
  };
}
