import { ApiRequestError, apiRequestHeaders, apiUrl, requestJson, userFacingApiError } from "@/shared/services/apiClient";
import type { DrawingCropInput, DrawingSourceUploadResult, DrawingState, DrawingType, FloorDrawing } from "./types";

const base = (projectId: string) => `/api/v1/projects/${projectId}/drawings`;

export function getDrawings(projectId: string, floorId?: string) {
  return requestJson<DrawingState>(`${base(projectId)}${floorId ? `?floor_id=${encodeURIComponent(floorId)}` : ""}`);
}

export function createDrawing(projectId: string, floorId: string, drawingType: DrawingType, name?: string) {
  return requestJson<{ drawing: FloorDrawing }>(`${base(projectId)}/floors/${floorId}`, { method: "POST", body: JSON.stringify({ drawing_type: drawingType, name: name || null }) });
}

export function updateDrawing(projectId: string, drawingId: string, payload: { name?: string }) {
  return requestJson<{ drawing: FloorDrawing }>(`${base(projectId)}/${drawingId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function removeDrawing(projectId: string, drawingId: string) {
  return requestJson(`${base(projectId)}/${drawingId}`, { method: "DELETE" });
}

export function saveDrawingCrop(projectId: string, drawingId: string, payload: DrawingCropInput) {
  return requestJson<{ drawing: FloorDrawing; revision: Record<string, unknown>; jobs: Array<Record<string, unknown>> }>(`${base(projectId)}/${drawingId}/crop`, { method: "PUT", body: JSON.stringify(payload) });
}

export function confirmDrawingRegistration(projectId: string, drawing: FloorDrawing, confirm = true) {
  return requestJson(`${base(projectId)}/${drawing.id}/registration`, {
    method: "PUT",
    body: JSON.stringify({ transform: drawing.transform || { matrix: [1, 0, 0, 1, 0, 0] }, anchors: drawing.anchors || [], residual_px: drawing.residual_px || null, confirm }),
  });
}

export function linkDrawingSpecifications(projectId: string, drawingId: string, sourceIds: string[]) {
  return requestJson(`${base(projectId)}/${drawingId}/specifications`, { method: "PUT", body: JSON.stringify({ source_ids: sourceIds }) });
}

export function uploadDrawingSource(projectId: string, drawingId: string, file: File, onProgress?: (percent: number) => void): Promise<DrawingSourceUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open("POST", apiUrl(`${base(projectId)}/${drawingId}/source`));
    Object.entries(apiRequestHeaders()).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new ApiRequestError(0, "The drawing source could not be uploaded."));
    request.onload = () => {
      let payload: unknown = null; try { payload = request.responseText ? JSON.parse(request.responseText) : null; } catch { payload = null; }
      if (request.status >= 200 && request.status < 300) { onProgress?.(100); resolve(payload as DrawingSourceUploadResult); return; }
      const raw = payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string" ? payload.detail : request.statusText || "Upload failed.";
      reject(new ApiRequestError(request.status, userFacingApiError(request.status, raw), raw));
    };
    const body = new FormData(); body.append("file", file); request.send(body);
  });
}

export function getDrawingSource(projectId: string, drawingId: string, documentId: string) {
  return requestJson<{ document: DrawingSourceUploadResult["document"] }>(
    `${base(projectId)}/${drawingId}/sources/${documentId}`,
  );
}
