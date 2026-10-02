"use client";

import { requestJson } from "@/shared/services/apiClient";
import type { RememberedRateMapping } from "./rateMatching";

export type BoqRateFileSelection = {
  project_id: string;
  rate_file_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BoqRateMapping = RememberedRateMapping & {
  id: string;
  project_id: string;
  rate_file_id: string;
  created_at: string;
  updated_at: string;
};

export async function getBoqRateMappings(projectId: string): Promise<{ selection: BoqRateFileSelection; mappings: BoqRateMapping[] }> {
  return requestJson(`/api/v1/projects/${projectId}/boq/rate-mappings`);
}

export async function saveBoqRateFileSelection(projectId: string, rateFileId: string | null): Promise<BoqRateFileSelection> {
  return requestJson(`/api/v1/projects/${projectId}/boq/rate-mappings/selection`, {
    method: "PUT",
    body: JSON.stringify({ rate_file_id: rateFileId }),
  });
}

export async function saveBoqRateMapping(
  projectId: string,
  rateFileId: string,
  mapping: RememberedRateMapping,
): Promise<BoqRateMapping> {
  return requestJson(`/api/v1/projects/${projectId}/boq/rate-mappings/${rateFileId}`, {
    method: "PUT",
    body: JSON.stringify(mapping),
  });
}
