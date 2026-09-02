"use client";

import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { QuantoWorkflowNav } from "./navigation";
import { useTakeoffWorkspacePersistence } from "./persistence/useTakeoffWorkspacePersistence";

export function QuantoPageShell({
  projectId,
  children,
  desktop = false,
}: {
  projectId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  desktop?: boolean;
}) {
  useTakeoffWorkspacePersistence(projectId);
  return (
    <PlatformShell
      title="Quanto"
      eyebrow="Automated BOQ"
      headerNavigation={<QuantoWorkflowNav projectId={projectId} office />}
      lockContent
      flushContent
      officeHeader
    >
      <div className="h-full min-h-0 overflow-hidden bg-white">
        <div className={desktop ? "flex h-full min-h-0 flex-col overflow-hidden" : "flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain bg-[#e8edf3] p-2"}>{children}</div>
      </div>
    </PlatformShell>
  );
}
