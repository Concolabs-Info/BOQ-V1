import { removeCachedJson, requestJson } from "@/shared/services/apiClient";
import type { CreatedCompany, CreatedProject, OnboardingStatus } from "./types";

const STATUS_PATH = "/api/v1/platform/onboarding/status";
const ME_PATH = "/api/v1/platform/me";

export function getOnboardingStatus(asFounder = false) {
  const path = asFounder ? `${STATUS_PATH}?founder=true` : STATUS_PATH;
  return requestJson<OnboardingStatus>(path, { skipCache: true });
}

export async function createOnboardingCompany(payload: {
  name: string;
  country: string;
  registration_type?: "PV" | "BR" | "NONE";
  registration_number?: string;
  lock_domain?: boolean;
}) {
  const created = await requestJson<CreatedCompany>("/api/v1/platform/onboarding/company", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCache: true,
  });
  removeCachedJson(ME_PATH);
  return created;
}

export async function createOnboardingProject(payload: {
  name: string;
  client_name?: string;
  location?: string;
  project_number?: string;
}) {
  const created = await requestJson<CreatedProject>("/api/v1/platform/onboarding/project", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCache: true,
  });
  removeCachedJson(ME_PATH);
  return created;
}
