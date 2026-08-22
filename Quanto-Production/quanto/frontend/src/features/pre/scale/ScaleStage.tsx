"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function ScaleStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="scale" />;
}
