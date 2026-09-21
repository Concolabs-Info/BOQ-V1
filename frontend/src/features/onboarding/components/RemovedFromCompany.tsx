"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { LoadingButton } from "@/components/ui/loading-button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { claimInvitation } from "../api";
import { MinimalShell } from "./MinimalShell";
import { onboarding3dButton } from "./onboardingButtonStyle";

const NO_INVITE_NOTE = "No invitation yet. Ask an owner to invite this email, then try again.";

export function RemovedFromCompany({
  companyName,
  reason,
}: {
  companyName: string;
  reason?: string | null;
}) {
  const t = useTranslations("onboarding.removedFromCompany");
  const router = useRouter();
  const deleted = reason === "company_deleted";
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const joinIfInvited = useCallback(
    async (silent = false) => {
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
    <MinimalShell
      heading={deleted ? t("titleDeleted", { name: companyName }) : t("titleRemoved", { name: companyName })}
      sub={deleted ? t("subDeleted") : t("subRemoved")}
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="leading-6 text-muted-foreground">{deleted ? t("bodyDeleted") : t("bodyRemoved")}</p>
        <LoadingButton
          type="button"
          className={`h-11 w-fit ${onboarding3dButton}`}
          pending={pending}
          onClick={() => void joinIfInvited()}
        >
          {pending ? t("checking") : t("checkInvite")}
        </LoadingButton>
        {note ? <p className="text-sm leading-6 text-muted-foreground">{note}</p> : null}
        <SignOutButton className="inline-flex w-fit items-center justify-center text-sm font-medium text-primary underline-offset-4 hover:underline" />
        <Link href={`${appRoutes.onboarding}?founder=1`} className="w-fit text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
          {t("setUpInstead")}
        </Link>
      </div>
    </MinimalShell>
  );
}
