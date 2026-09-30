"use client";

import { requestJson } from "@/shared/services/apiClient";
import type { RateBreakdownItem, RateBreakdownItemInput } from "./types";

export async function listRateBreakdownItems(projectId: string): Promise<RateBreakdownItem[]> {
  const result = await requestJson<{ items: RateBreakdownItem[] }>(`/api/v1/projects/${projectId}/rate-breakdown-items`);
  return result.items;
}

export async function createRateBreakdownItem(projectId: string, payload: RateBreakdownItemInput): Promise<RateBreakdownItem> {
  return requestJson<RateBreakdownItem>(`/api/v1/projects/${projectId}/rate-breakdown-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRateBreakdownItem(projectId: string, itemId: string, payload: RateBreakdownItemInput): Promise<RateBreakdownItem> {
  return requestJson<RateBreakdownItem>(`/api/v1/projects/${projectId}/rate-breakdown-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteRateBreakdownItem(projectId: string, itemId: string): Promise<void> {
  await requestJson<void>(`/api/v1/projects/${projectId}/rate-breakdown-items/${itemId}`, { method: "DELETE" });
}
