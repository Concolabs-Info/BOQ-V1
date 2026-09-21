"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { LoadingState } from "@/shared/components/LoadingState";
import { MinimalShell } from "@/features/onboarding/components/MinimalShell";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";

function OnboardingLoadingFallback() {
  const t = useTranslations("shell");
  return (
    <MinimalShell heading={t("settingUp")}>
      <LoadingState label={t("loadingSetup")} />
    </MinimalShell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoadingFallback />}>
      <OnboardingWizard />
    </Suspense>
  );
}
