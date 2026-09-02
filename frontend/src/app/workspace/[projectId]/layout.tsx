import type { ReactNode } from "react";
import { EditChangesPrompt } from "@/features/quanto/editing/EditChangesPrompt";

export default async function ProjectWorkspaceLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const {
    children
  } = props;

  return <>{children}<EditChangesPrompt projectId={params.projectId}/></>;
}
