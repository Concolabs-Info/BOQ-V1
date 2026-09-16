"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/features/brand/SplitPane";

export function OnboardingShell({
  rail,
  heading,
  sub,
  mobileHint,
  children,
}: {
  rail: ReactNode;
  heading: string;
  sub?: string;
  mobileHint?: string;
  children: ReactNode;
}) {
  return (
    <SplitPane rail={rail} heading={heading} sub={sub} mobileHint={mobileHint} from="onboarding">
      {children}
    </SplitPane>
  );
}
