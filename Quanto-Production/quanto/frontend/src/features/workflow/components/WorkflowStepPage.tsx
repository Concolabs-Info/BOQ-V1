"use client";
import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { QuantoWorkflowNav } from "@/features/quanto/navigation";
import type { WorkflowStepKey } from "../types";
import { WorkspacePanel } from "./WorkspacePanel";

export function WorkflowStepPage({projectId,stepKey,children}:{projectId:string;stepKey:WorkflowStepKey;children?:ReactNode}){
  return <PlatformShell title="Quanto" eyebrow="Automated BOQ" headerNavigation={<QuantoWorkflowNav projectId={projectId}/> }>
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f7f9fc] shadow-sm">
      <div className="p-5 lg:p-6"><WorkspacePanel>{children}</WorkspacePanel></div>
    </div>
  </PlatformShell>;
}
