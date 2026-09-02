"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function PlansStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="plans" />;
}
