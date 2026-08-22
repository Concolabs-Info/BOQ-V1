import { requestJson } from "@/shared/services/apiClient";
import type { CalibrationInput, ScaleState } from "./types";

const base = (projectId: string) => `/api/v1/projects/${projectId}/scale`;

export function getScaleState(projectId: string): Promise<ScaleState> {
  return requestJson<ScaleState>(base(projectId));
}

export function saveFloorCalibration(projectId: string, floorId: string, payload: CalibrationInput) {
  return requestJson<{ calibration: unknown; jobs: unknown[]; versions: Record<string, number> }>(`${base(projectId)}/floors/${floorId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveDrawingCalibration(projectId: string, drawingId: string, payload: CalibrationInput) {
  return requestJson<{ calibration: unknown; jobs: unknown[]; versions: Record<string, number> }>(`${base(projectId)}/drawings/${drawingId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
