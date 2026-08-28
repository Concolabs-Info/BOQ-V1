"use client";
import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { QuantoWorkflowNav } from "@/features/quanto/navigation";
import type { WorkflowStepKey } from "../types";
import { WorkspacePanel } from "./WorkspacePanel";

export function WorkflowStepPage({projectId,stepKey,children}:{projectId:string;stepKey:WorkflowStepKey;children?:ReactNode}){
  return <PlatformShell title="Quanto" eyebrow="Automated BOQ" headerNavigation={<QuantoWorkflowNav projectId={projectId} office/>} lockContent flushContent officeHeader>
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#e8edf3] p-2"><WorkspacePanel office>{children}</WorkspacePanel></div>
    </div>
  </PlatformShell>;
}
