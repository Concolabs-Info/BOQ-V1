"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function HeightStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="height" />;
}
