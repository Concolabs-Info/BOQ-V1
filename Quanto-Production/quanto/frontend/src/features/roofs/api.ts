import { downloadApiFile, requestJson } from "@/shared/services/apiClient";
import type { Point } from "@/features/drawing/types";
import type { RoofDefinition, RoofPlanePayload, RoofState } from "./types";

const base = (projectId: string) => `/api/v1/projects/${projectId}/roofs`;

export function getRoofState(projectId: string, levelId?: string | null, floorId?: string | null) {
  const query = new URLSearchParams();
  if (levelId) query.set("level_id", levelId);
  if (floorId) query.set("floor_id", floorId);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestJson<RoofState>(`${base(projectId)}${suffix}`);
}
export type RoofAnalysisQuality = "easy" | "medium" | "expert" | "maximum";
export type RoofBackgroundJob = { id: string; status: string; progress: number; created?: boolean; requeued?: boolean };
export type RoofJobResponse = { job: RoofBackgroundJob };
export function analyzeRoofs(projectId: string, hostFloorId?: string | null, force = false, quality: RoofAnalysisQuality = "medium") { return requestJson(`${base(projectId)}/analyze`, { method: "POST", body: JSON.stringify({ host_floor_id: hostFloorId || null, force, method: "ai", quality }) }); }
export function importRoofJson(projectId: string, hostFloorId: string, result: Record<string, unknown>, quality: RoofAnalysisQuality = "medium") { return requestJson<RoofJobResponse>(`${base(projectId)}/import-json`, { method: "POST", body: JSON.stringify({ host_floor_id: hostFloorId, result, force: true, quality }) }); }
export function downloadRoofCrop(projectId: string, hostFloorId: string) {
  return downloadApiFile(
    `${base(projectId)}/crop?host_floor_id=${encodeURIComponent(hostFloorId)}`,
    "roof-plan-crop.png",
  );
}
export function createRoofLevel(projectId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofLevel(projectId: string, levelId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRoofLevel(projectId: string, levelId: string) { return requestJson(`${base(projectId)}/levels/${levelId}`, { method: "DELETE" }); }
export function createRoofDefinition(projectId: string, payload: Record<string, unknown>) { return requestJson<{ definition: RoofDefinition }>(`${base(projectId)}/definitions`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofDefinition(projectId: string, definitionId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/definitions/${definitionId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function addRoofLayer(projectId: string, definitionId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/definitions/${definitionId}/layers`, { method: "POST", body: JSON.stringify(payload) }); }
export function createRoofPlane(projectId: string, levelId: string, payload: RoofPlanePayload & { points: Point[] }) { return requestJson(`${base(projectId)}/levels/${levelId}/planes`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofPlane(projectId: string, levelId: string, planeId: string, payload: RoofPlanePayload) { return requestJson(`${base(projectId)}/levels/${levelId}/planes/${planeId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRoofPlane(projectId: string, levelId: string, planeId: string) { return requestJson(`${base(projectId)}/levels/${levelId}/planes/${planeId}`, { method: "DELETE" }); }
export function splitRoofPlane(projectId: string, levelId: string, planeId: string, line: Point[]) { return requestJson(`${base(projectId)}/levels/${levelId}/planes/${planeId}/split`, { method: "POST", body: JSON.stringify({ line }) }); }
export function mergeRoofPlanes(projectId: string, levelId: string, planeIds: string[]) { return requestJson(`${base(projectId)}/levels/${levelId}/planes/merge`, { method: "POST", body: JSON.stringify({ plane_ids: planeIds }) }); }
export function createRoofEdge(projectId: string, levelId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/edges`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofEdge(projectId: string, levelId: string, edgeId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/edges/${edgeId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRoofEdge(projectId: string, levelId: string, edgeId: string) { return requestJson(`${base(projectId)}/levels/${levelId}/edges/${edgeId}`, { method: "DELETE" }); }
export function createRoofOpening(projectId: string, levelId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/openings`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofOpening(projectId: string, levelId: string, openingId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/openings/${openingId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRoofOpening(projectId: string, levelId: string, openingId: string) { return requestJson(`${base(projectId)}/levels/${levelId}/openings/${openingId}`, { method: "DELETE" }); }
export function createRoofComponent(projectId: string, levelId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/components`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateRoofComponent(projectId: string, levelId: string, componentId: string, payload: Record<string, unknown>) { return requestJson(`${base(projectId)}/levels/${levelId}/components/${componentId}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRoofComponent(projectId: string, levelId: string, componentId: string) { return requestJson(`${base(projectId)}/levels/${levelId}/components/${componentId}`, { method: "DELETE" }); }
export function recalculateRoofs(projectId: string, levelId: string) { return requestJson(`${base(projectId)}/recalculate`, { method: "POST", body: JSON.stringify({ level_id: levelId }) }); }
export function confirmRoofEntities(projectId: string, entityType: "level" | "plane" | "edge" | "opening" | "component", entityIds: string[]) { return requestJson(`${base(projectId)}/confirm`, { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_ids: entityIds }) }); }
export function restoreRoofHistory(projectId: string, revisionId: string) { return requestJson(`${base(projectId)}/history/${revisionId}/restore`, { method: "POST", body: JSON.stringify({ reason: "Restored from Roofs" }) }); }
