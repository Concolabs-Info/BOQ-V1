"use client";

import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { SettingsSubnav } from "./SettingsSubnav";

export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PlatformShell title={title} eyebrow="Settings" headerNavigation={<SettingsSubnav />}>
      {children}
    </PlatformShell>
  );
}
