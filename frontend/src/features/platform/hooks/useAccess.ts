"use client";

import { useEffect, useState } from "react";
import { getCachedPlatformContext, getPlatformContext } from "@/features/platform/services/platformService";
import {
  canAccessStage,
  hasPermission,
  workspaceHome,
  type WorkflowStage,
} from "@/features/settings/access";
import { appRoutes } from "@/shared/constants/appRoutes";

export function useAccess() {
  const cached = typeof window === "undefined" ? null : getCachedPlatformContext();
  const [permissions, setPermissions] = useState<string[] | null>(cached?.permissions ?? null);
  const [ready, setReady] = useState(cached != null);

  useEffect(() => {
    let live = true;
    getPlatformContext()
      .then((context) => {
        if (!live) return;
        setPermissions(context.permissions);
        setReady(true);
      })
      .catch(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const list = permissions ?? [];

  function can(key: string) {
    if (!ready) return true;
    return hasPermission(list, key);
  }

  function canStage(stage: WorkflowStage) {
    if (!ready) return true;
    return canAccessStage(list, stage);
  }

  function home(projectId: string) {
    if (!ready) return appRoutes.workspace(projectId);
    return workspaceHome(projectId, list);
  }

  return { ready, permissions: list, can, canStage, home };
}
