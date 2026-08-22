import type { ReactNode } from "react";
import { EditChangesPrompt } from "@/features/quanto/editing/EditChangesPrompt";

export default function ProjectWorkspaceLayout({ children, params }: { children: ReactNode; params: { projectId: string } }) {
  return <>{children}<EditChangesPrompt projectId={params.projectId}/></>;
}
