"use client";

import { requestJson } from "@/shared/services/apiClient";
import type { NormComposition, NormCompositionInput, NormOptionType, NormOptions } from "./types";

function normalizeComposition(item: NormComposition): NormComposition {
  return {
    ...item,
    items: item.items.map((child) => ({ ...child, quantity: Number(child.quantity), sort_order: Number(child.sort_order || 0) })),
  };
}

export async function listNormItems(projectId: string): Promise<NormComposition[]> {
  const result = await requestJson<{ items: NormComposition[] }>(`/api/v1/projects/${projectId}/norm-items`);
  return result.items.map(normalizeComposition);
}

export async function createNormItem(projectId: string, payload: NormCompositionInput): Promise<NormComposition> {
  return requestJson<NormComposition>(`/api/v1/projects/${projectId}/norm-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(normalizeComposition);
}

export async function updateNormItem(projectId: string, itemId: string, payload: NormCompositionInput): Promise<NormComposition> {
  return requestJson<NormComposition>(`/api/v1/projects/${projectId}/norm-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then(normalizeComposition);
}

export async function deleteNormItem(projectId: string, itemId: string): Promise<void> {
  await requestJson<void>(`/api/v1/projects/${projectId}/norm-items/${itemId}`, { method: "DELETE" });
}

export async function listNormOptions(projectId: string): Promise<NormOptions> {
  const result = await requestJson<{ options: NormOptions }>(`/api/v1/projects/${projectId}/norm-options`);
  return result.options;
}

export async function createNormOption(projectId: string, optionType: NormOptionType, value: string): Promise<void> {
  await requestJson(`/api/v1/projects/${projectId}/norm-options`, {
    method: "POST",
    body: JSON.stringify({ option_type: optionType, value }),
  });
}
