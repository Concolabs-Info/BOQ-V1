"use client";

import { usePathname } from "next/navigation";
import { useWorkflowPrefetch } from "../hooks/useWorkflowPrefetch";
import { WORKFLOW_STEPS } from "../steps";

export function WorkflowRouteWarmup({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const current = WORKFLOW_STEPS.find((step) => pathname === `/workspace/${projectId}/${step.key}`)?.key;
  useWorkflowPrefetch(projectId, current);
  return null;
}
