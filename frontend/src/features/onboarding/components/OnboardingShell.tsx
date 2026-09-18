"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/features/brand/SplitPane";

export function OnboardingShell({
  rail,
  heading,
  sub,
  mobileHint,
  layout,
  children,
}: {
  rail: ReactNode;
  heading: string;
  sub?: string;
  mobileHint?: string;
  layout?: "form" | "document";
  children: ReactNode;
}) {
  return (
    <SplitPane rail={rail} heading={heading} sub={sub} mobileHint={mobileHint} from="onboarding" layout={layout}>
      {children}
    </SplitPane>
  );
}
