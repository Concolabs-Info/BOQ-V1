import { WorkflowStepPage } from "@/features/workflow/components/WorkflowStepPage";
import { RoofWorkspace } from "./RoofWorkspace";

export function RoofsPage({ projectId }: { projectId: string }) {
  return <WorkflowStepPage projectId={projectId} stepKey="roofs"><RoofWorkspace projectId={projectId} /></WorkflowStepPage>;
}
