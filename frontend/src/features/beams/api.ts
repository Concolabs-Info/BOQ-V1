import { apiRequestHeaders, apiUrl } from "@/shared/services/apiClient";
import type { BeamEditorState, BeamStateResponse } from "./types";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...apiRequestHeaders(),
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body
      ? String((body as { detail?: unknown }).detail || "")
      : text;
    throw new Error(detail || `Beam request failed (${response.status})`);
  }
  return body as T;
}

export function getBeamState(projectId: string): Promise<BeamStateResponse> {
  return json(`/api/v1/projects/${projectId}/takeoff/beams/state`);
}

export function reanalyzeBeams(projectId: string): Promise<{ analysis: BeamStateResponse["analysis"] }> {
  return json(`/api/v1/projects/${projectId}/takeoff/beams/analyze?force=true`, { method: "POST" });
}

export function saveBeamEditor(projectId: string, editor: BeamEditorState): Promise<{ editor: BeamEditorState }> {
  return json(`/api/v1/projects/${projectId}/takeoff/beams/editor-state`, {
    method: "PUT",
    body: JSON.stringify(editor),
  });
}

export function answerBeamQuestion(projectId: string, questionId: string, answer: string): Promise<{ editor: BeamEditorState }> {
  return json(`/api/v1/projects/${projectId}/takeoff/beams/questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify({ answer }),
  });
}
