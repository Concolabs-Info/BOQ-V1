"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadingButton } from "@/components/ui/loading-button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { claimInvitation, declinePendingInvites } from "../api";
import type { ExistingCompany } from "../types";
import { onboarding3dButton } from "./onboardingButtonStyle";
import { TermsConsentLine } from "./TermsConsentLine";

export function AcceptInviteStep({
  company,
  projectCount = 0,
}: {
  company: ExistingCompany | null;
  projectCount?: number;
}) {
  const t = useTranslations("onboarding.acceptInvite");
  const router = useRouter();
  const started = useRef(false);
  const label = company?.name ?? "the company";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  async function join() {
    setPending(true);
    setError(null);
    try {
      const result = await claimInvitation();
      if (result.claimed || result.already_member) {
        router.replace(appRoutes.projects);
        return;
      }
      setError("This invitation is no longer valid. Ask an admin to send a new one.");
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 410) {
        setError("This invitation has expired. Ask an admin to send a new one.");
      } else {
        setError(caught instanceof Error ? caught.message : `We couldn't get you into ${label}. Mind trying again?`);
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join();
  }, [router]);

  return (
    <div className="flex flex-col gap-5">
      {pending && !error ? (
        <p className="text-sm leading-6 text-muted-foreground">{t("joining", { name: label })}</p>
      ) : null}
      {error ? (
        <>
          <p className="text-sm leading-6 text-destructive">{error}</p>
          <LoadingButton type="button" className={`h-11 w-full ${onboarding3dButton}`} onClick={() => void join()}>
            {t("tryAgain")}
          </LoadingButton>
        </>
      ) : !pending ? (
        <LoadingButton type="button" className={`h-11 w-full ${onboarding3dButton}`} onClick={() => void join()}>
          {t("joinButton", { name: label })}
        </LoadingButton>
      ) : null}
      {projectCount > 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {projectCount === 1 ? t("projectCountSingular") : t("projectCountPlural", { count: projectCount })}
        </p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">{t("noProjectYet")}</p>
      )}
      <button
        type="button"
        className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        disabled={pending}
        onClick={() => {
          void (async () => {
            try {
              await declinePendingInvites();
            } catch {
              // Local onboarding can continue even if revoke already happened.
            }
            router.replace(`${appRoutes.onboarding}?founder=1`);
          })();
        }}
      >
        {t("setUpInstead")}
      </button>
      <TermsConsentLine action={t("consentAction")} />
    </div>
  );
}
