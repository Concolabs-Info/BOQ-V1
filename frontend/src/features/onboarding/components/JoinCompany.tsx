"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ExistingCompany } from "../types";

export function JoinCompany({
  company,
  domain,
}: {
  company: ExistingCompany | null;
  domain: string | null;
}) {
  const router = useRouter();
  const label = company?.name ?? domain ?? "your company";

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" className="h-11 w-full rounded-xl" onClick={() => router.push(`${appRoutes.onboarding}/pending`)}>
        Request to join
      </Button>
      <p className="text-sm leading-6 text-slate-500">
        An admin at {label} invites people by email. If you already have an invite, open that email instead.
      </p>
      <Link href={`${appRoutes.onboarding}?founder=1`} className="text-sm font-medium text-blue-700 hover:text-blue-800">
        Set up a new company with this account instead
      </Link>
    </div>
  );
}
