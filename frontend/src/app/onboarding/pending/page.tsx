"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { BrandRailNote } from "@/features/onboarding/components/OnboardingStepper";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { claimInvitation, currentTermsAccepted, getOnboardingStatus } from "@/features/onboarding/api";
import { appRoutes } from "@/shared/constants/appRoutes";

export default function OnboardingPendingPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!(await currentTermsAccepted())) {
        if (!mounted) return;
        router.replace(appRoutes.onboardingTerms);
        return;
      }
      try {
        const claimed = await claimInvitation();
        if (!mounted) return;
        if (claimed.claimed || claimed.already_member) {
          router.replace(appRoutes.projects);
          return;
        }
      } catch {
        // No open invite. Stay here unless status says otherwise.
      }
      try {
        const status = await getOnboardingStatus();
        if (!mounted) return;
        if (status.path === "ACCEPT_INVITE") router.replace(appRoutes.onboarding);
        if (status.path === "DONE") router.replace(appRoutes.projects);
      } catch {
        // Keep the waiting screen.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <OnboardingShell
      rail={<BrandRailNote />}
      heading="Waiting for an admin"
      sub="Ask an admin at your company to invite you. You'll get an email when they do."
    >
      <SignOutButton />
    </OnboardingShell>
  );
}
