import { requestJson } from "@/shared/services/apiClient";
import type { Point } from "@/features/drawing/types";
import type { CeilingDefinition, CeilingDefinitionPayload, CeilingFeaturePayload, CeilingHistory, CeilingRegistration, CeilingState, CeilingZoneUpdate } from "./types";

const base = (projectId: string) => `/api/v1/projects/${projectId}/ceilings`;

export function getCeilingState(projectId: string, floorId?: string | null) {
  return requestJson<CeilingState>(`${base(projectId)}${floorId ? `?floor_id=${encodeURIComponent(floorId)}` : ""}`);
}

export function analyzeCeilings(projectId: string, floorId?: string | null, force = false) {
  return requestJson(`${base(projectId)}/analyze`, { method: "POST", body: JSON.stringify({ floor_id: floorId || null, force }) });
}

export function checkCeilingPlan(projectId: string, floorId: string, force = false) {
  return requestJson(`${base(projectId)}/floors/${floorId}/check-plan`, { method: "POST", body: JSON.stringify({ force }) });
}

export function createCeilingDefinition(projectId: string, payload: CeilingDefinitionPayload) {
  return requestJson<{ definition: CeilingDefinition }>(`${base(projectId)}/definitions`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateCeilingDefinition(projectId: string, definitionId: string, payload: Partial<CeilingDefinitionPayload>) {
  return requestJson<{ definition: CeilingDefinition }>(`${base(projectId)}/definitions/${definitionId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deactivateCeilingDefinition(projectId: string, definitionId: string) {
  return requestJson(`${base(projectId)}/definitions/${definitionId}`, { method: "DELETE" });
}

export function addCeilingLayer(projectId: string, definitionId: string, payload: Record<string, unknown>) {
  return requestJson(`${base(projectId)}/definitions/${definitionId}/layers`, { method: "POST", body: JSON.stringify(payload) });
}

export function createCeilingZone(projectId: string, floorId: string, payload: CeilingZoneUpdate & { points: Point[]; definition_id?: string | null }) {
  return requestJson(`${base(projectId)}/floors/${floorId}/zones`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateCeilingZone(projectId: string, floorId: string, zoneId: string, payload: CeilingZoneUpdate) {
  return requestJson(`${base(projectId)}/floors/${floorId}/zones/${zoneId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCeilingZone(projectId: string, floorId: string, zoneId: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/zones/${zoneId}`, { method: "DELETE" });
}

export function splitCeilingZone(projectId: string, floorId: string, zoneId: string, line: Point[]) {
  return requestJson(`${base(projectId)}/floors/${floorId}/zones/${zoneId}/split`, { method: "POST", body: JSON.stringify({ line }) });
}

export function mergeCeilingZones(projectId: string, floorId: string, zoneIds: string[]) {
  return requestJson(`${base(projectId)}/floors/${floorId}/zones/merge`, { method: "POST", body: JSON.stringify({ zone_ids: zoneIds }) });
}

export function assignCeilingSystem(projectId: string, zoneIds: string[], definitionId: string | null, confirm = true) {
  return requestJson(`${base(projectId)}/assignments`, { method: "POST", body: JSON.stringify({ zone_ids: zoneIds, definition_id: definitionId, confirm }) });
}

export function createCeilingFeature(projectId: string, floorId: string, payload: CeilingFeaturePayload) {
  return requestJson(`${base(projectId)}/floors/${floorId}/features`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateCeilingFeature(projectId: string, floorId: string, featureId: string, payload: Partial<CeilingFeaturePayload>) {
  return requestJson(`${base(projectId)}/floors/${floorId}/features/${featureId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteCeilingFeature(projectId: string, floorId: string, featureId: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/features/${featureId}`, { method: "DELETE" });
}

export function createCeilingOpening(projectId: string, floorId: string, payload: Record<string, unknown>) {
  return requestJson(`${base(projectId)}/floors/${floorId}/openings`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateCeilingRegistration(projectId: string, floorId: string, registration: CeilingRegistration, confirm = true) {
  return requestJson<{ registration: CeilingRegistration }>(`${base(projectId)}/floors/${floorId}/registration`, {
    method: "PUT",
    body: JSON.stringify({
      source_region_id: registration.source_region_id,
      transform: registration.transform,
      anchors: registration.anchors,
      residual_px: registration.residual_px,
      confirm,
    }),
  });
}

export function confirmCeilings(projectId: string, entityType: "zone" | "assignment" | "feature", entityIds: string[]) {
  return requestJson(`${base(projectId)}/confirm`, { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_ids: entityIds }) });
}

export function reviewCeilingCandidates(projectId: string, floorId: string, candidateIds: string[], action: "accept" | "reject", reason?: string) {
  return requestJson(`${base(projectId)}/floors/${floorId}/candidates/review`, {
    method: "POST",
    body: JSON.stringify({ candidate_ids: candidateIds, action, reason: reason || null }),
  });
}

export function applyTypicalCeilingFloor(projectId: string, sourceFloorId: string, targetFloorIds: string[]) {
  return requestJson(`${base(projectId)}/typical-floors`, { method: "POST", body: JSON.stringify({ source_floor_id: sourceFloorId, target_floor_ids: targetFloorIds }) });
}

export function getCeilingHistory(projectId: string, floorId?: string | null) {
  return requestJson<{ history: CeilingHistory[] }>(`${base(projectId)}/history${floorId ? `?floor_id=${encodeURIComponent(floorId)}` : ""}`);
}

export function restoreCeilingHistory(projectId: string, revisionId: string) {
  return requestJson(`${base(projectId)}/history/${revisionId}/restore`, { method: "POST", body: JSON.stringify({ reason: "Restored from Ceilings" }) });
}
