"use client";

import { Suspense } from "react";
import { LoadingState } from "@/shared/components/LoadingState";
import { BrandRailNote } from "@/features/onboarding/components/OnboardingStepper";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <OnboardingShell rail={<BrandRailNote />} heading="Setting up">
          <LoadingState label="Loading your company setup" />
        </OnboardingShell>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}
