"use client";

import { useQuery } from "@tanstack/react-query";
import { getBoqState } from "../api";
import { useDemoStore } from "@/features/demo/store";
import { useStructuralStore } from "@/features/quanto/structuralStore";

export const boqQueryKey = (projectId: string, floorId: string | null, grouping: string) => ["boq", projectId, floorId, grouping] as const;

export function useBoqState(projectId: string, floorId: string | null, grouping: string) {
  const takeoffRevision = useDemoStore((state) => [state.openings, state.walls, state.floorZones, state.ceilingZones, state.roofZones, state.manualRows].map(items => items.map(item => `${item.id}:${"status" in item ? item.status : ""}`).join("|")).join("/"));
  const structureRevision = useStructuralStore((state) => [state.columns, state.beams, state.slabPlates].map(items => items.map(item => `${item.id}:${item.status}`).join("|")).join("/"));
  return useQuery({
    queryKey: [...boqQueryKey(projectId, floorId, grouping), takeoffRevision, structureRevision],
    queryFn: () => getBoqState(projectId, floorId, grouping),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 0,
    placeholderData: (previous) => previous,
    refetchInterval: (query) => query.state.data?.active_jobs.length ? 2000 : false,
  });
}
