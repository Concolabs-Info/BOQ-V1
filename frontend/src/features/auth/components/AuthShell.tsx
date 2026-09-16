"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/features/brand/SplitPane";
import { BrandRailNote } from "@/features/onboarding/components/OnboardingStepper";

export function AuthShell({
  title,
  subtitle,
  rail,
  from,
  children,
}: {
  title: string;
  subtitle: string;
  rail?: ReactNode;
  from?: "sign-in" | "sign-up" | "onboarding";
  children: ReactNode;
}) {
  return (
    <SplitPane rail={rail ?? <BrandRailNote />} heading={title} sub={subtitle} from={from}>
      {children}
    </SplitPane>
  );
}
