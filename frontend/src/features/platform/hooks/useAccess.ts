"use client";

import { useEffect, useState } from "react";
import {
  cachePlatformContext,
  getCachedPlatformContext,
  getPlatformContext,
  type PlatformContext,
} from "@/features/platform/services/platformService";
import {
  canAccessStage,
  hasPermission,
  workspaceHome,
  type WorkflowStage,
} from "@/features/settings/access";
import { roleDescription, roleLabel } from "@/features/settings/rbac";
import { appRoutes } from "@/shared/constants/appRoutes";

function roleFromContext(context: PlatformContext) {
  const key = context.membership_role;
  if (!key) return { label: null as string | null, description: null as string | null };
  return {
    label: context.role_label || roleLabel(key),
    description: roleDescription(key, context.role_description) || null,
  };
}

export function useAccess() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [hasCompany, setHasCompany] = useState(false);
  const [roleLabelText, setRoleLabelText] = useState<string | null>(null);
  const [roleDescriptionText, setRoleDescriptionText] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  function apply(context: PlatformContext) {
    const role = roleFromContext(context);
    setPermissions(context.permissions);
    setHasCompany(Boolean(context.organization));
    setRoleLabelText(role.label);
    setRoleDescriptionText(role.description);
  }

  useEffect(() => {
    let live = true;
    const cached = getCachedPlatformContext();
    if (cached) {
      apply(cached);
      setReady(true);
    }
    getPlatformContext()
      .then((context) => {
        if (!live) return;
        cachePlatformContext(context);
        apply(context);
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

  return {
    ready,
    permissions: list,
    hasCompany,
    roleLabel: roleLabelText,
    roleDescription: roleDescriptionText,
    can,
    canStage,
    home,
  };
}
