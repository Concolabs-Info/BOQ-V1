"use client";

import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { BrandRailNote } from "@/features/onboarding/components/OnboardingStepper";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";

export default function OnboardingPendingPage() {
  return (
    <OnboardingShell
      rail={<BrandRailNote />}
      heading="Waiting for an admin"
      sub="Ask an admin at your company to invite you. You’ll get an email when they do."
    >
      <SignOutButton />
    </OnboardingShell>
  );
}
