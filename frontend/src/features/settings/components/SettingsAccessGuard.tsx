"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { canAccessSettingsSection, settingsSectionFromPath } from "@/features/settings/access";
import { useAccess } from "@/features/platform/hooks/useAccess";
import { appRoutes } from "@/shared/constants/appRoutes";

export function SettingsAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, permissions, hasCompany } = useAccess();

  const section = settingsSectionFromPath(pathname);
  const privileged = section !== null && section !== "account";
  const allowed = !privileged || (ready && canAccessSettingsSection(permissions, section, { hasCompany }));

  useEffect(() => {
    if (!ready || !privileged || allowed) return;
    if (section === "companyOverview" && hasCompany) {
      router.replace(appRoutes.organizationSettings);
      return;
    }
    router.replace(appRoutes.accountProfile);
  }, [allowed, hasCompany, privileged, ready, router, section]);

  if (!allowed) {
    return <div className="min-h-dvh bg-[#eef3f8]" aria-label="Loading settings" />;
  }

  return children;
}
