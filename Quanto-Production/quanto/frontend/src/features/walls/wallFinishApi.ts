import { requestJson } from "@/shared/services/apiClient";
import type { WallFinishDefinitionPayload, WallFinishState } from "./wallFinishTypes";

const base = (projectId: string) => `/api/v1/projects/${projectId}/wall-finishes`;

export function getWallFinishState(projectId: string, floorId?: string | null) {
  return requestJson<WallFinishState>(`${base(projectId)}${floorId ? `?floor_id=${encodeURIComponent(floorId)}` : ""}`);
}
export function ensureWallFinishes(projectId: string, floorId?: string | null, force = false) {
  const query = new URLSearchParams();
  if (floorId) query.set("floor_id", floorId);
  if (force) query.set("force", "true");
  return requestJson(`${base(projectId)}/ensure?${query}`, { method: "POST" });
}
export function assignWallFinish(projectId: string, payload: { wall_face_ids?: string[]; zone_ids?: string[]; finish_id: string | null; waste_percent?: number | null; confirm?: boolean }) {
  return requestJson(`${base(projectId)}/assignments`, { method: "POST", body: JSON.stringify(payload) });
}
export function confirmWallFinishes(projectId: string, payload: { assignment_ids: string[]; scope: "selected" | "floor" | "project"; floor_id?: string | null }) {
  return requestJson(`${base(projectId)}/assignments/confirm`, { method: "POST", body: JSON.stringify(payload) });
}
export function createWallFinishZone(projectId: string, faceId: string, payload: Record<string, unknown>) {
  return requestJson(`${base(projectId)}/faces/${faceId}/zones`, { method: "POST", body: JSON.stringify(payload) });
}
export function updateWallFinishZone(projectId: string, zoneId: string, payload: Record<string, unknown>) {
  return requestJson(`${base(projectId)}/zones/${zoneId}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteWallFinishZone(projectId: string, zoneId: string) {
  return requestJson(`${base(projectId)}/zones/${zoneId}`, { method: "DELETE" });
}
export function createWallFinishDefinition(projectId: string, payload: WallFinishDefinitionPayload) {
  return requestJson(`${base(projectId)}/definitions`, { method: "POST", body: JSON.stringify(payload) });
}
export function updateWallFinishDefinition(projectId: string, finishId: string, payload: Partial<WallFinishDefinitionPayload>) {
  return requestJson(`${base(projectId)}/definitions/${finishId}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deactivateWallFinishDefinition(projectId: string, finishId: string) {
  return requestJson(`${base(projectId)}/definitions/${finishId}`, { method: "DELETE" });
}
export function updateWallFinishNorth(projectId: string, floorId: string, planNorthDegrees: number) {
  return requestJson(`${base(projectId)}/floors/${floorId}/settings`, { method: "PATCH", body: JSON.stringify({ plan_north_degrees: planNorthDegrees, status: "confirmed" }) });
}
