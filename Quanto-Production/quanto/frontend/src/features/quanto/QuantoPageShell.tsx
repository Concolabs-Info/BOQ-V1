"use client";

import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { QuantoWorkflowNav } from "./navigation";

export function QuantoPageShell({
  projectId,
  children,
}: {
  projectId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PlatformShell
      title="Quanto"
      eyebrow="Automated BOQ"
      headerNavigation={<QuantoWorkflowNav projectId={projectId} />}
      lockContent
    >
      <div className="h-full min-h-0 overflow-hidden rounded-[28px] border border-slate-200 bg-[#f7f9fc] shadow-sm">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain p-5 lg:p-6">{children}</div>
      </div>
    </PlatformShell>
  );
}
