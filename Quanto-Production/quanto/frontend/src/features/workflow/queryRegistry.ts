import type { QueryClient } from "@tanstack/react-query";
import { getBoqState } from "@/features/boq/api";
import { getCeilingState } from "@/features/ceilings/api";
import { getFloorPlans } from "@/features/floor-plans/api";
import { getFloorsState } from "@/features/floors/api";
import { getModelReviewState } from "@/features/model-review/api";
import { getReviewState } from "@/features/review/api";
import { getRoofState } from "@/features/roofs/api";
import { getScaleState } from "@/features/scale/api";
import { getSpecifications } from "@/features/specifications/api";
import { getWallsState } from "@/features/walls/api";
import { preloadAsset } from "@/features/floor-plans/hooks/useAssetUrl";
import type { WorkflowStepKey } from "./types";

export const workflowPageQueryKeys = {
  floorPlans: (projectId: string) => ["floor-plans", projectId] as const,
  specifications: (projectId: string) => ["specifications", projectId] as const,
  scale: (projectId: string) => ["scale", projectId] as const,
  modelReview: (projectId: string) => ["model-review", projectId, null] as const,
  walls: (projectId: string) => ["walls", projectId, null] as const,
  floors: (projectId: string) => ["floors", projectId, null] as const,
  roofs: (projectId: string) => ["roofs", projectId, null] as const,
  ceilings: (projectId: string) => ["ceilings", projectId, null] as const,
  review: (projectId: string) => ["review", projectId, null, "all"] as const,
  boq: (projectId: string) => ["boq", projectId, null, "item"] as const,
};

const STALE_TIME = 30_000;

const ASSET_KEYS = [
  "architectural_drawing_url",
  "drawing_url",
  "crop_asset_url",
  "preview_asset_url",
  "thumbnail_asset_url",
] as const;

function findPrimaryAsset(value: unknown, depth = 0): string | null {
  if (!value || depth > 5 || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 2)) {
      const found = findPrimaryAsset(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ASSET_KEYS) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  for (const key of ["drawing", "selected_floor", "floors", "floor_plans", "crops", "pages"]) {
    const found = findPrimaryAsset(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

async function loadAndWarmAsset<T>(loader: () => Promise<T>): Promise<T> {
  const data = await loader();
  const asset = findPrimaryAsset(data);
  if (asset) void preloadAsset(asset);
  return data;
}

/** Warms the exact cache entry used by a workflow page before navigation. */
export function prefetchWorkflowStepData(client: QueryClient, projectId: string, step: WorkflowStepKey) {
  switch (step) {
    case "floor-plans": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.floorPlans(projectId), queryFn: () => loadAndWarmAsset(() => getFloorPlans(projectId)), staleTime: 60 * 60_000 });
    case "specifications": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.specifications(projectId), queryFn: () => getSpecifications(projectId), staleTime: STALE_TIME });
    case "scale": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.scale(projectId), queryFn: () => loadAndWarmAsset(() => getScaleState(projectId)), staleTime: STALE_TIME });
    case "model-review": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.modelReview(projectId), queryFn: () => loadAndWarmAsset(() => getModelReviewState(projectId, null)), staleTime: STALE_TIME });
    case "walls": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.walls(projectId), queryFn: () => loadAndWarmAsset(() => getWallsState(projectId, null)), staleTime: STALE_TIME });
    case "floors": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.floors(projectId), queryFn: () => loadAndWarmAsset(() => getFloorsState(projectId, null)), staleTime: STALE_TIME });
    case "roofs": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.roofs(projectId), queryFn: () => loadAndWarmAsset(() => getRoofState(projectId, null, null)), staleTime: STALE_TIME });
    case "ceilings": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.ceilings(projectId), queryFn: () => loadAndWarmAsset(() => getCeilingState(projectId, null)), staleTime: STALE_TIME });
    case "review": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.review(projectId), queryFn: () => getReviewState(projectId, null, "all"), staleTime: STALE_TIME });
    case "boq": return client.prefetchQuery({ queryKey: workflowPageQueryKeys.boq(projectId), queryFn: () => getBoqState(projectId, null, "item"), staleTime: STALE_TIME });
    default: return Promise.resolve();
  }
}
