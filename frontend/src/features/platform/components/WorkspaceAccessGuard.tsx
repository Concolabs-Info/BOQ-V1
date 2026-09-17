"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { canAccessStage, hasPermission, workspaceHome, workspaceStageFromPath } from "@/features/settings/access";
import { useAccess } from "@/features/platform/hooks/useAccess";
import { TakeoffGeometryProvider } from "@/features/quanto/takeoffGeometryAccess";

export function WorkspaceAccessGuard({ projectId, children }: { projectId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, permissions } = useAccess();

  const stage = workspaceStageFromPath(pathname);
  const blocked = ready && stage !== null && !canAccessStage(permissions, stage);
  const geometryAllowed = stage !== "takeoff" || !ready || hasPermission(permissions, "takeoff:edit");

  useEffect(() => {
    if (!blocked) return;
    const next = workspaceHome(projectId, permissions);
    if (next !== pathname) router.replace(next);
  }, [blocked, pathname, permissions, projectId, router]);

  return (
    <TakeoffGeometryProvider allowed={geometryAllowed}>
      {blocked ? null : children}
    </TakeoffGeometryProvider>
  );
}
