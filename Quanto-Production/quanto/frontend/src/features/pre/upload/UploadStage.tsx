"use client";

import { PrePage } from "@/features/pre/components/PrePage";

export function UploadStage({ projectId }: { projectId: string }) {
  return <PrePage projectId={projectId} step="upload" />;
}
