import { apiUrl, apiRequestHeaders, requestJson } from "@/shared/services/apiClient";
import type {
  DocumentRow,
  HeightCandidate,
  HeightSuggestionResponse,
  JsonObject,
  PreState,
  ProjectFrame,
  ScaleFit,
  ScaleSetResponse,
  SpecItem,
  Storey,
  Viewport,
} from "../types/server";

export const renderUrl = (id?: string | null) => (id ? apiUrl(`/api/v1/renders/${id}`) : "");
export const cropUrl = (id: string) => apiUrl(`/api/v1/viewports/${id}/crop`);

export const preApi = {
  pre: (projectId: string) => requestJson<PreState>(`/api/v1/projects/${projectId}/pre`, { cache: "no-store" }),
  document: (id: string) => requestJson<DocumentRow & { ingested_pages: number; pages?: Array<Record<string, unknown>> }>(`/api/v1/documents/${id}`, { cache: "no-store" }),
  upload: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestJson<DocumentRow>(`/api/v1/projects/${projectId}/documents`, { method: "POST", body: form });
  },
  triage: (projectId: string) => requestJson<{ status: string }>(`/api/v1/projects/${projectId}/triage`, { method: "POST" }),
  patchSheet: (id: string, data: JsonObject) => requestJson(`/api/v1/sheets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  patchViewport: (id: string, data: JsonObject) => requestJson<Viewport>(`/api/v1/viewports/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  addViewport: (data: JsonObject) => requestJson<Viewport>(`/api/v1/viewports`, { method: "POST", body: JSON.stringify(data) }),
  deleteViewport: (id: string) => requestJson<void>(`/api/v1/viewports/${id}`, { method: "DELETE" }),
  reorderStoreys: (projectId: string, storeyIds: string[]) => requestJson<Storey[]>(`/api/v1/projects/${projectId}/storeys/reorder`, { method: "POST", body: JSON.stringify({ storey_ids: storeyIds }) }),
  patchStorey: (id: string, data: JsonObject) => requestJson<Storey>(`/api/v1/storeys/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  suggestScale: (viewportId: string) => requestJson<ScaleFit>(`/api/v1/viewports/${viewportId}/scale/suggest`, { method: "POST" }),
  setScale: (viewportId: string, data: JsonObject) => requestJson<ScaleSetResponse>(`/api/v1/viewports/${viewportId}/scale`, { method: "PUT", body: JSON.stringify(data) }),
  heightCandidates: (projectId: string) => requestJson<HeightCandidate[]>(`/api/v1/projects/${projectId}/height-candidates`, { cache: "no-store" }),
  suggestHeights: (projectId: string, data: JsonObject) => requestJson<HeightSuggestionResponse>(`/api/v1/projects/${projectId}/heights/suggest`, { method: "POST", body: JSON.stringify(data) }),
  setHeight: (storeyId: string, data: JsonObject) => requestJson<Storey>(`/api/v1/storeys/${storeyId}/height`, { method: "PUT", body: JSON.stringify(data) }),
  extractSpecs: (projectId: string) => requestJson<{ status: string }>(`/api/v1/projects/${projectId}/specs/extract`, { method: "POST" }),
  patchSpec: (id: string, data: JsonObject) => requestJson<SpecItem>(`/api/v1/spec-items/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  addSpec: (projectId: string, data: JsonObject) => requestJson<SpecItem>(`/api/v1/projects/${projectId}/spec-items`, { method: "POST", body: JSON.stringify(data) }),
  confirm: (entityType: string, entityId: string) => requestJson(`/api/v1/confirmations`, { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, actor: "user" }) }),
  freeze: (projectId: string) => requestJson<ProjectFrame>(`/api/v1/projects/${projectId}/pre/freeze`, { method: "POST" }),
  frame: (projectId: string) => requestJson<ProjectFrame>(`/api/v1/projects/${projectId}/pre/frame`, { cache: "no-store" }),
};

export async function uploadAndWaitForIngest(projectId: string, file: File, onProgress?: (progress: number) => void) {
  const doc = await preApi.upload(projectId, file);
  let state = await preApi.document(doc.id);
  while (state.status === "queued" || state.status === "processing") {
    onProgress?.(state.progress || 0);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    state = await preApi.document(doc.id);
  }
  onProgress?.(state.progress || 100);
  if (state.status !== "ready") throw new Error(state.error_message || "PDF processing failed.");
  return state;
}
