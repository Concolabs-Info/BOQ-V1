"use client";

import type { ReactNode } from "react";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { SettingsSubnav } from "./SettingsSubnav";

export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PlatformShell title={title} eyebrow="Settings">
      <div className="mx-auto flex w-full max-w-5xl flex-col-reverse gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1">{children}</div>
        <SettingsSubnav />
      </div>
    </PlatformShell>
  );
}
