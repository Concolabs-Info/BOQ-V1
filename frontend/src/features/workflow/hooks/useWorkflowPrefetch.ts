"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";
import { prefetchWorkflowStepData } from "../queryRegistry";
import { WORKFLOW_STEPS, workflowStepIndex } from "../steps";
import type { WorkflowStepKey } from "../types";

export function useWorkflowPrefetch(projectId: string, currentStep?: WorkflowStepKey) {
  const client = useQueryClient();
  const router = useRouter();

  const prefetchStep = useCallback((step: WorkflowStepKey) => {
    router.prefetch(appRoutes.workflowStep(projectId, step));
    void prefetchWorkflowStepData(client, projectId, step);
  }, [client, projectId, router]);

  useEffect(() => {
    if (!currentStep) return;
    const index = workflowStepIndex(currentStep);
    const warm = () => {
      const previous = WORKFLOW_STEPS[index - 1];
      const next = WORKFLOW_STEPS[index + 1];
      if (next) prefetchStep(next.key);
      if (previous) prefetchStep(previous.key);
    };
    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleApi.requestIdleCallback) {
      const id = idleApi.requestIdleCallback(warm, { timeout: 1000 });
      return () => idleApi.cancelIdleCallback?.(id);
    }
    const id = globalThis.setTimeout(warm, 150);
    return () => globalThis.clearTimeout(id);
  }, [currentStep, prefetchStep]);

  return prefetchStep;
}
