"use client";

import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { SettingsAccessGuard } from "./SettingsAccessGuard";
import { SettingsSubnav } from "./SettingsSubnav";

export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsAccessGuard>
      <PlatformShell title={title} eyebrow="Settings" headerNavigation={<SettingsSubnav />}>
        {children}
      </PlatformShell>
    </SettingsAccessGuard>
  );
}
