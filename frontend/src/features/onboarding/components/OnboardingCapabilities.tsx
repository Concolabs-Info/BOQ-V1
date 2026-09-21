"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FeaturePreviewCarousel } from "./FeaturePreviewCarousel";
import { InviteMockup, MultiProjectMockup, PlanReviewMockup, TakeoffMockup } from "./OnboardingFeatureMockups";
import { onboarding3dButton, onboarding3dButtonSecondary } from "./onboardingButtonStyle";

/**
 * The fork point right after a company is created: a quick pitch for what
 * Quanto does, then a choice between diving straight into the dashboard or
 * setting up the first project (which leads on to inviting the team).
 */
export function OnboardingCapabilities({
  onGoToDashboard,
  onCreateProject,
}: {
  onGoToDashboard: () => void;
  onCreateProject: () => void;
}) {
  const t = useTranslations("onboarding.capabilities");

  const slides = [
    { title: t("reviewTitle"), description: t("reviewDescription"), preview: <PlanReviewMockup /> },
    { title: t("takeoffTitle"), description: t("takeoffDescription"), preview: <TakeoffMockup /> },
    { title: t("multiProjectTitle"), description: t("multiProjectDescription"), preview: <MultiProjectMockup /> },
    { title: t("inviteTitle"), description: t("inviteDescription"), preview: <InviteMockup /> },
  ];

  return (
    <div className="flex flex-col gap-3 roomy:gap-4">
      <FeaturePreviewCarousel slides={slides} />
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button
          type="button"
          variant="outline"
          className={`h-10 w-full roomy:h-11 sm:flex-1 ${onboarding3dButtonSecondary}`}
          onClick={onGoToDashboard}
        >
          {t("goToDashboard")}
        </Button>
        <Button type="button" className={`h-10 w-full roomy:h-11 sm:flex-1 ${onboarding3dButton}`} onClick={onCreateProject}>
          {t("createProjectButton")}
        </Button>
      </div>
    </div>
  );
}
