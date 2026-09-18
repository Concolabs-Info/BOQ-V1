import type { ReactNode } from "react";
import { EditChangesPrompt } from "@/features/quanto/editing/EditChangesPrompt";
import { WorkspaceAccessGuard } from "@/features/platform/components/WorkspaceAccessGuard";

export default async function ProjectWorkspaceLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const {
    children
  } = props;

  return (
    <>
      <WorkspaceAccessGuard projectId={params.projectId}>{children}</WorkspaceAccessGuard>
      <EditChangesPrompt projectId={params.projectId} />
    </>
  );
}
