"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { claimInvitation, currentTermsAccepted } from "../api";
import { BrandRailNote } from "./OnboardingStepper";
import { OnboardingShell } from "./OnboardingShell";

const NO_INVITE_NOTE = "No invitation yet. Ask an owner to invite this email, then try again.";

export function RemovedFromCompany({
  companyName,
  reason,
}: {
  companyName: string;
  reason?: string | null;
}) {
  const router = useRouter();
  const deleted = reason === "company_deleted";
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const joinIfInvited = useCallback(
    async (silent = false) => {
      if (!(await currentTermsAccepted())) {
        router.replace(appRoutes.onboardingTerms);
        return false;
      }
      if (!silent) {
        setPending(true);
        setNote(null);
      }
      try {
        const claimed = await claimInvitation();
        if (claimed.claimed || claimed.already_member) {
          router.replace(appRoutes.projects);
          return true;
        }
        if (!silent) {
          setNote(NO_INVITE_NOTE);
        }
      } catch (caught) {
        if (!silent) {
          if (caught instanceof ApiRequestError && caught.status === 410) {
            setNote("That invitation expired. Ask an owner to send a new one.");
          } else {
            setNote(NO_INVITE_NOTE);
          }
        }
      } finally {
        if (!silent) setPending(false);
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      void joinIfInvited(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [joinIfInvited]);

  return (
    <OnboardingShell
      rail={<BrandRailNote />}
      heading={deleted ? `${companyName} is no longer on Quanto` : `You no longer have access to ${companyName}`}
      sub={
        deleted
          ? "The company was deleted. Your account is still here, without a role. An owner can invite you to another company, or you can set up a new one with this account."
          : "An admin removed your access. If that was a mistake, ask them to invite you again."
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {deleted ? (
          <p className="leading-6 text-slate-500">
            If someone invites this email, you will join the next time you sign in — there is no second invite email,
            because this account already exists. You can also tap below after they send it.
          </p>
        ) : (
          <p className="leading-6 text-slate-500">
            Nothing you worked on is lost. An admin can restore your access at any time from Settings. If they invite
            this email, you join the next time you sign in.
          </p>
        )}
        <Button type="button" className="h-11 w-fit rounded-xl" disabled={pending} onClick={() => void joinIfInvited()}>
          {pending ? "Checking…" : "I've been invited"}
        </Button>
        {note ? <p className="text-sm leading-6 text-slate-500">{note}</p> : null}
        <SignOutButton className="inline-flex w-fit items-center justify-center text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800" />
        <Link href={`${appRoutes.onboarding}?founder=1`} className="w-fit text-slate-500 underline underline-offset-2 hover:text-slate-950">
          Set up a new company with this account instead
        </Link>
      </div>
    </OnboardingShell>
  );
}
