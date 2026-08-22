import { requestJson } from "@/shared/services/apiClient";
import type { FloorWorkDefinition, FloorWorkDefinitionPayload, FloorWorkState, FloorWorkType, SkirtingEdge } from "./types";

const base = (projectId: string) => `/api/v1/projects/${projectId}/floor-works`;

export function getFloorWorkState(projectId: string, floorId?: string | null) {
  const query = floorId ? `?floor_id=${encodeURIComponent(floorId)}` : "";
  return requestJson<FloorWorkState>(`${base(projectId)}${query}`);
}

export function analyzeFloorWorks(projectId: string, floorId?: string | null, force = false) {
  return requestJson(`${base(projectId)}/analyze`, { method: "POST", body: JSON.stringify({ floor_id: floorId || null, force }) });
}

export function recalculateFloorWorks(projectId: string, floorId: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/recalculate`, { method: "POST" });
}

export function createFloorWorkDefinition(projectId: string, payload: FloorWorkDefinitionPayload) {
  return requestJson<FloorWorkDefinition>(`${base(projectId)}/definitions`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateFloorWorkDefinition(projectId: string, definitionId: string, payload: Partial<FloorWorkDefinitionPayload>) {
  return requestJson<FloorWorkDefinition>(`${base(projectId)}/definitions/${definitionId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deactivateFloorWorkDefinition(projectId: string, definitionId: string) {
  return requestJson(`${base(projectId)}/definitions/${definitionId}`, { method: "DELETE" });
}

export function assignFloorWork(projectId: string, payload: {
  room_ids: string[];
  work_type: FloorWorkType;
  definition_id?: string | null;
  required: boolean;
  coverage_type?: "whole_room" | "selected_zone";
  zone_id?: string | null;
  thickness_mm?: number | null;
  layer_count?: number | null;
  waste_percent?: number;
  upturn_required?: boolean;
  upturn_height_mm?: number | null;
  reason?: string;
}) {
  return requestJson(`${base(projectId)}/assignments`, { method: "POST", body: JSON.stringify(payload) });
}

export function confirmFloorWorks(projectId: string, assignmentIds: string[], scope: "selected" | "floor" | "project", floorId?: string | null) {
  return requestJson(`${base(projectId)}/assignments/confirm`, { method: "POST", body: JSON.stringify({ assignment_ids: assignmentIds, scope, floor_id: floorId || null }) });
}

export function createFloorWorkZone(projectId: string, floorId: string, roomId: string, workType: FloorWorkType, points: Array<{ x: number; y: number }>, name?: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/rooms/${roomId}/zones`, { method: "POST", body: JSON.stringify({ work_type: workType, points, name: name || null }) });
}

export function deleteFloorWorkZone(projectId: string, floorId: string, roomId: string, zoneId: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/rooms/${roomId}/zones/${zoneId}`, { method: "DELETE" });
}

export function updateSkirtingEdge(projectId: string, floorId: string, roomId: string, edgeId: string, edgeType: SkirtingEdge["edge_type"], reason?: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/rooms/${roomId}/skirting-edges/${edgeId}`, { method: "PATCH", body: JSON.stringify({ edge_type: edgeType, reason: reason || null }) });
}

export function getFloorWorkHistory(projectId: string, floorId?: string | null) {
  const query = floorId ? `?floor_id=${encodeURIComponent(floorId)}` : "";
  return requestJson<{ history: Array<Record<string, unknown>> }>(`${base(projectId)}/history${query}`);
}

export function restoreFloorWorkHistory(projectId: string, historyId: string) {
  return requestJson(`${base(projectId)}/history/${historyId}/restore`, { method: "POST", body: JSON.stringify({ reason: "Restored from Floor works" }) });
}
