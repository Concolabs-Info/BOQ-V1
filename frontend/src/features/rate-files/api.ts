"use client";

import { requestJson } from "@/shared/services/apiClient";
import type { RateFile, RateItem, RateItemInput, RateOptionType, RateOptions } from "./types";

export async function listRateFiles(projectId: string): Promise<RateFile[]> {
  const result = await requestJson<{ rate_files: RateFile[] }>(`/api/v1/projects/${projectId}/rate-files`);
  return result.rate_files;
}

export async function createRateFile(projectId: string, name: string): Promise<RateFile> {
  return requestJson<RateFile>(`/api/v1/projects/${projectId}/rate-files`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateRateFile(projectId: string, rateFileId: string, name: string): Promise<RateFile> {
  return requestJson<RateFile>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteRateFile(projectId: string, rateFileId: string): Promise<void> {
  await requestJson<void>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}`, { method: "DELETE" });
}

export async function listRateItems(projectId: string, rateFileId: string, search = ""): Promise<RateItem[]> {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const query = params.toString();
  const result = await requestJson<{ items: RateItem[] }>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}/items${query ? `?${query}` : ""}`);
  return result.items.map((item) => ({
    ...item,
    unit_cost: Number(item.unit_cost),
    markup_percent: Number(item.markup_percent),
  }));
}

export async function createRateItem(projectId: string, rateFileId: string, payload: RateItemInput): Promise<RateItem> {
  return requestJson<RateItem>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRateItem(projectId: string, rateFileId: string, itemId: string, payload: RateItemInput): Promise<RateItem> {
  return requestJson<RateItem>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteRateItem(projectId: string, rateFileId: string, itemId: string): Promise<void> {
  await requestJson<void>(`/api/v1/projects/${projectId}/rate-files/${rateFileId}/items/${itemId}`, { method: "DELETE" });
}

export async function listRateOptions(projectId: string): Promise<RateOptions> {
  const result = await requestJson<{ options: RateOptions }>(`/api/v1/projects/${projectId}/rate-options`);
  return result.options;
}

export async function createRateOption(projectId: string, optionType: RateOptionType, value: string): Promise<void> {
  await requestJson(`/api/v1/projects/${projectId}/rate-options`, {
    method: "POST",
    body: JSON.stringify({ option_type: optionType, value }),
  });
}
