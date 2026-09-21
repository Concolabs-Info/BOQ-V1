"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { onboarding3dButtonSecondary } from "@/features/onboarding/components/onboardingButtonStyle";
import { oauthStrategyUnavailableText, thrownErrText } from "../clerk-errors";
import {
  isOAuthStrategyAllowed,
  OAUTH_GOOGLE,
  OAUTH_MICROSOFT,
  OFFERED_OAUTH_STRATEGIES,
  startOAuthRedirect,
  type OAuthStrategy,
} from "../oauth";

export function SocialAuthButtons({
  intent,
  completePath,
  selectAccount = false,
  disabled = false,
  onError,
}: {
  intent: "sign-in" | "sign-up";
  completePath?: string;
  selectAccount?: boolean;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("auth.social");
  const clerk = useClerk();
  const [pending, setPending] = useState<OAuthStrategy | null>(null);

  async function start(strategy: OAuthStrategy) {
    if (!clerk.loaded || disabled || pending) return;
    onError(null);
    if (!isOAuthStrategyAllowed(clerk, strategy)) {
      onError(oauthStrategyUnavailableText());
      return;
    }
    setPending(strategy);
    try {
      await startOAuthRedirect(clerk, { strategy, intent, completePath, selectAccount });
    } catch (err) {
      setPending(null);
      onError(thrownErrText(err));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {OFFERED_OAUTH_STRATEGIES.map((strategy) => (
          <Button
            key={strategy}
            type="button"
            variant="outline"
            disabled={disabled || !clerk.loaded || Boolean(pending)}
            onClick={() => void start(strategy)}
            className={`h-11 w-full gap-2.5 ${onboarding3dButtonSecondary}`}
          >
            {pending === strategy ? (
              <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : strategy === OAUTH_GOOGLE ? (
              <GoogleMark />
            ) : (
              <MicrosoftMark />
            )}
            {strategy === OAUTH_GOOGLE ? t("continueWithGoogle") : t("continueWithMicrosoft")}
          </Button>
        ))}
      </div>
      <AuthMethodDivider />
    </>
  );
}

export function AuthMethodDivider() {
  const t = useTranslations("auth.social");
  return (
    <div className="flex items-center gap-3">
      <span className="h-px min-w-0 flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("orDivider")}</span>
      <span className="h-px min-w-0 flex-1 bg-border" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.48a5.54 5.54 0 0 1-2.4 3.63v3.01h3.87c2.26-2.08 3.54-5.15 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.08.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.26v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.21 7.21 0 0 1 4.87 12c0-.79.14-1.55.38-2.26V6.63H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.37l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.63l3.99 3.11C6.2 6.87 8.86 4.75 12 4.75Z"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path fill="#F25022" d="M11.4 11.4H2V2h9.4v9.4Z" />
      <path fill="#7FBA00" d="M22 11.4h-9.4V2H22v9.4Z" />
      <path fill="#00A4EF" d="M11.4 22H2v-9.4h9.4V22Z" />
      <path fill="#FFB900" d="M22 22h-9.4v-9.4H22V22Z" />
    </svg>
  );
}
