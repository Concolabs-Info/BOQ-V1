"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ExistingCompany } from "../types";
import { onboarding3dButton } from "./onboardingButtonStyle";

export function JoinCompany({
  company,
  domain,
}: {
  company: ExistingCompany | null;
  domain: string | null;
}) {
  const t = useTranslations("onboarding.joinCompany");
  const router = useRouter();
  const label = company?.name ?? domain ?? "your company";

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className={`h-11 w-full ${onboarding3dButton}`}
        onClick={() => router.push(`${appRoutes.onboarding}/pending`)}
      >
        {t("requestButton")}
      </Button>
      <p className="text-sm leading-6 text-muted-foreground">{t("hint", { name: label })}</p>
      <Link href={`${appRoutes.onboarding}?founder=1`} className="text-sm font-medium text-primary hover:underline">
        {t("setUpInstead")}
      </Link>
    </div>
  );
}
