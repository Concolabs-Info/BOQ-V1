import { WorkflowStepPage } from "@/features/workflow/components/WorkflowStepPage";
import { CeilingWorkspace } from "./CeilingWorkspace";

export function CeilingsPage({ projectId }: { projectId: string }) {
  return <WorkflowStepPage projectId={projectId} stepKey="ceilings"><CeilingWorkspace projectId={projectId} /></WorkflowStepPage>;
}
