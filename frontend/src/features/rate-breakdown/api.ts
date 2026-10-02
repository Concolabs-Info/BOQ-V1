"use client";

import { requestJson } from "@/shared/services/apiClient";
import type { RateBreakdownItem, RateBreakdownItemInput } from "./types";

function normalizeRateBreakdown(item: RateBreakdownItem): RateBreakdownItem {
  return {
    ...item,
    analysis_quantity: Number(item.analysis_quantity || 1),
    rows: (item.rows || []).map((row) => ({
      ...row,
      quantity: Number(row.quantity || 0),
      selected_rate: row.selected_rate == null ? null : Number(row.selected_rate),
      amount: row.amount == null ? null : Number(row.amount),
      sort_order: Number(row.sort_order || 0),
    })),
    summary: {
      ...item.summary,
      total: Number(item.summary?.total || 0),
      rate_for_unit: Number(item.summary?.rate_for_unit || 0),
      rate_say_unit: Number(item.summary?.rate_say_unit || 0),
      rate_say_ft3: Number(item.summary?.rate_say_ft3 || 0),
      rate_say_m3: Number(item.summary?.rate_say_m3 || 0),
      analysis_quantity: Number(item.summary?.analysis_quantity || item.analysis_quantity || 1),
      analysis_unit: item.summary?.analysis_unit || item.analysis_unit || "cube",
    },
  };
}

export async function listRateBreakdownItems(projectId: string): Promise<RateBreakdownItem[]> {
  const result = await requestJson<{ items: RateBreakdownItem[] }>(`/api/v1/projects/${projectId}/rate-breakdown-items`);
  return result.items.map(normalizeRateBreakdown);
}

export async function createRateBreakdownItem(projectId: string, payload: RateBreakdownItemInput): Promise<RateBreakdownItem> {
  return requestJson<RateBreakdownItem>(`/api/v1/projects/${projectId}/rate-breakdown-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(normalizeRateBreakdown);
}

export async function updateRateBreakdownItem(projectId: string, itemId: string, payload: RateBreakdownItemInput): Promise<RateBreakdownItem> {
  return requestJson<RateBreakdownItem>(`/api/v1/projects/${projectId}/rate-breakdown-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then(normalizeRateBreakdown);
}

export async function deleteRateBreakdownItem(projectId: string, itemId: string): Promise<void> {
  await requestJson<void>(`/api/v1/projects/${projectId}/rate-breakdown-items/${itemId}`, { method: "DELETE" });
}
