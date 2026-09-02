"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function SpecificationsStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="specifications" />;
}
