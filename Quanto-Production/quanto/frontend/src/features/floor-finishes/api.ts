import { requestJson } from "@/shared/services/apiClient";
import type {
  FinishDefinition,
  FinishDefinitionPayload,
  FloorFinishState,
} from "./types";

const base = (projectId: string) =>
  `/api/v1/projects/${projectId}/floor-finishes`;

export function getFloorFinishState(
  projectId: string,
  floorId?: string | null,
) {
  const query = floorId ? `?floor_id=${encodeURIComponent(floorId)}` : "";
  return requestJson<FloorFinishState>(`${base(projectId)}${query}`);
}

export function analyzeFloorFinishes(
  projectId: string,
  floorId?: string | null,
  force = false,
) {
  return requestJson(`${base(projectId)}/analyze`, {
    method: "POST",
    body: JSON.stringify({ floor_id: floorId || null, force }),
  });
}

export function createFinishDefinition(
  projectId: string,
  payload: FinishDefinitionPayload,
) {
  return requestJson<FinishDefinition>(`${base(projectId)}/definitions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFinishDefinition(
  projectId: string,
  finishId: string,
  payload: Partial<FinishDefinitionPayload>,
) {
  return requestJson<FinishDefinition>(
    `${base(projectId)}/definitions/${finishId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export function deactivateFinishDefinition(
  projectId: string,
  finishId: string,
) {
  return requestJson(`${base(projectId)}/definitions/${finishId}`, {
    method: "DELETE",
  });
}

export function assignFinishToRooms(
  projectId: string,
  roomIds: string[],
  finishId: string | null,
  wastePercent?: number,
  reason?: string,
  measurementBasis?: "area" | "linear" | null,
  measurementReason?: string,
) {
  return requestJson(`${base(projectId)}/assignments`, {
    method: "POST",
    body: JSON.stringify({
      room_ids: roomIds,
      finish_id: finishId,
      waste_percent: wastePercent,
      reason: reason || null,
      measurement_basis: measurementBasis || null,
      measurement_reason: measurementReason || null,
    }),
  });
}

export function confirmFinishAssignments(
  projectId: string,
  assignmentIds: string[],
  scope: "selected" | "floor" | "project",
  floorId?: string | null,
) {
  return requestJson(`${base(projectId)}/assignments/confirm`, {
    method: "POST",
    body: JSON.stringify({
      assignment_ids: assignmentIds,
      scope,
      floor_id: floorId || null,
    }),
  });
}

export function createCanonicalFinishZone(
  projectId: string,
  floorId: string,
  roomId: string,
  payload: {
    points: Array<{ x: number; y: number }>;
    name?: string;
    finish_id?: string;
    waste_percent?: number;
  },
) {
  return requestJson(
    `${base(projectId)}/floors/${floorId}/rooms/${roomId}/zones`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function updateCanonicalFinishZone(
  projectId: string,
  floorId: string,
  roomId: string,
  zoneId: string,
  payload: Record<string, unknown>,
) {
  return requestJson(
    `${base(projectId)}/floors/${floorId}/rooms/${roomId}/zones/${zoneId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export function deleteCanonicalFinishZone(
  projectId: string,
  floorId: string,
  roomId: string,
  zoneId: string,
) {
  return requestJson(
    `${base(projectId)}/floors/${floorId}/rooms/${roomId}/zones/${zoneId}`,
    { method: "DELETE" },
  );
}

export function getFinishHistory(
  projectId: string,
  floorId?: string | null,
) {
  const query = floorId ? `?floor_id=${encodeURIComponent(floorId)}` : "";
  return requestJson<{ history: Array<Record<string, unknown>> }>(
    `${base(projectId)}/history${query}`,
  );
}

export function restoreFinishHistory(
  projectId: string,
  historyId: string,
  reason?: string,
) {
  return requestJson(`${base(projectId)}/history/${historyId}/restore`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || null }),
  });
}
