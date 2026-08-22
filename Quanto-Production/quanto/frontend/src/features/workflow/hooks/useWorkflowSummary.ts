"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCachedJson } from "@/shared/services/apiClient";
import { getWorkflowSummary } from "../api";
import { workflowQueryKeys } from "../queryKeys";
import type { ProjectWorkflowSummary } from "../types";

export function useWorkflowSummary(projectId: string) {
  const queryClient = useQueryClient();
  const path = `/api/v1/projects/${projectId}/workflow/summary`;
  const queryKey = useMemo(() => workflowQueryKeys.summary(projectId), [projectId]);

  const query = useQuery({
    queryKey,
    queryFn: () => getWorkflowSummary(projectId),
    refetchInterval: (currentQuery) => (currentQuery.state.data?.active_jobs.length ? 2_000 : false),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  });

  useEffect(() => {
    if (queryClient.getQueryData(queryKey) !== undefined) return;
    const cached = getCachedJson<ProjectWorkflowSummary>(path);
    if (cached) queryClient.setQueryData(queryKey, cached);
  }, [path, queryClient, queryKey]);

  return query;
}
