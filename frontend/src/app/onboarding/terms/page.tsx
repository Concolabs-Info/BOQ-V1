import { Suspense } from "react";
import type { Metadata } from "next";
import { loadTermsDocument } from "@/features/legal/loadTerms";
import { BrandRailNote } from "@/features/onboarding/components/OnboardingStepper";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { TermsAgreePage } from "@/features/onboarding/components/TermsAgreePage";
import { LoadingState } from "@/shared/components/LoadingState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms of Service · Quanto" };

export default function OnboardingTermsPage() {
  const document = loadTermsDocument();
  return (
    <Suspense
      fallback={
        <OnboardingShell layout="document" rail={<BrandRailNote />} heading="Terms of Service">
          <LoadingState label="Loading terms" />
        </OnboardingShell>
      }
    >
      <TermsAgreePage document={document} />
    </Suspense>
  );
}
