"use client";

import Link from "next/link";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { appRoutes } from "@/shared/constants/appRoutes";
import { BrandRailNote } from "./OnboardingStepper";
import { OnboardingShell } from "./OnboardingShell";

export function RemovedFromCompany({ companyName }: { companyName: string }) {
  return (
    <OnboardingShell
      rail={<BrandRailNote />}
      heading={`You no longer have access to ${companyName}`}
      sub="An admin removed your access. If that was a mistake, ask them to invite you again."
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="leading-6 text-slate-500">
          Nothing you worked on is lost. An admin can restore your access at any time from Settings.
        </p>
        <SignOutButton className="inline-flex w-fit items-center justify-center text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800" />
        <Link href={`${appRoutes.onboarding}?founder=1`} className="w-fit text-slate-500 underline underline-offset-2 hover:text-slate-950">
          Set up a new company with this account instead
        </Link>
      </div>
    </OnboardingShell>
  );
}
