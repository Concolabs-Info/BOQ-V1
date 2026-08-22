"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function StartTakeoffStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="start-takeoff" />;
}
