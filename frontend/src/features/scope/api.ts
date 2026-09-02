import { requestJson } from "@/shared/services/apiClient";
import type { ScopeManifest } from "./types";

function base(projectId: string, element: string) {
  return `/api/v1/projects/${projectId}/takeoff/${element}/scope`;
}

export const scopeApi = {
  get: (projectId: string, element: string) =>
    requestJson<ScopeManifest>(base(projectId, element), { cache: "no-store" }),
  run: (projectId: string, element: string) =>
    requestJson<ScopeManifest>(`${base(projectId, element)}/run?force=true`, { method: "POST" }),
  answer: (projectId: string, element: string, questionId: string, choice: string) =>
    requestJson<ScopeManifest>(`${base(projectId, element)}/questions/${questionId}/answer`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    }),
};
