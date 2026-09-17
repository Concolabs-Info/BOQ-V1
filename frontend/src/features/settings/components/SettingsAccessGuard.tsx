"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { canAccessSettingsSection, settingsSectionFromPath } from "@/features/settings/access";
import { useAccess } from "@/features/platform/hooks/useAccess";
import { appRoutes } from "@/shared/constants/appRoutes";

export function SettingsAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, permissions } = useAccess();

  const section = settingsSectionFromPath(pathname);
  const blocked = ready && section !== null && !canAccessSettingsSection(permissions, section);

  useEffect(() => {
    if (!blocked) return;
    router.replace(appRoutes.accountProfile);
  }, [blocked, router]);

  if (blocked) return null;
  return children;
}
