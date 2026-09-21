"use client";

import Link from "next/link";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MinimalShell } from "@/features/onboarding/components/MinimalShell";
import { appRoutes } from "@/shared/constants/appRoutes";
import { oauthCallbackHadError, oauthPaths } from "../oauth";

// If Clerk hasn't redirected us onward by then, either the IdP reported its
// error through a query param we don't recognize or something else stalled.
// Rather than spin forever, offer a manual way out.
const STALL_TIMEOUT_MS = 12_000;

/**
 * Completes Google/Microsoft redirect. Transfers between sign-in and
 * sign-up when the account already exists (or doesn't), and sends first-time
 * users to company creation.
 */
export function SsoCallback({ intent }: { intent: "sign-in" | "sign-up" }) {
  const t = useTranslations("auth.social");
  const searchParams = useSearchParams();
  const outcome = oauthCallbackHadError(searchParams.toString());
  const backHref = intent === "sign-up" ? "/sign-up" : "/sign-in";
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (outcome) return;
    const timer = window.setTimeout(() => setStalled(true), STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  if (outcome || stalled) {
    const sub = outcome === "cancelled" ? t("cancelled") : outcome === "failed" ? t("failed") : t("timedOut");
    return (
      <MinimalShell heading={t("couldNotFinish")} sub={sub} width="sm">
        <p className="text-center text-sm text-muted-foreground">
          <Link href={backHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("backToAuth")}
          </Link>
        </p>
      </MinimalShell>
    );
  }

  return (
    <>
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl={appRoutes.projects}
        signUpFallbackRedirectUrl={appRoutes.onboarding}
        continueSignUpUrl={oauthPaths.continueSignUp}
        firstFactorUrl="/sign-in"
        secondFactorUrl="/sign-in"
        resetPasswordUrl="/sign-in"
      />
      <MinimalShell heading={intent === "sign-up" ? t("finishingSignUp") : t("finishing")} card={false} width="sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <div id="clerk-captcha" className="empty:hidden" />
        </div>
      </MinimalShell>
    </>
  );
}
