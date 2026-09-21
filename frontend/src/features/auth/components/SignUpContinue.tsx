"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingButton } from "@/components/ui/loading-button";
import { MinimalShell } from "@/features/onboarding/components/MinimalShell";
import { onboarding3dButton } from "@/features/onboarding/components/onboardingButtonStyle";
import { TermsConsentLine } from "@/features/onboarding/components/TermsConsentLine";
import { FieldErrorText } from "@/shared/components/FieldErrorText";
import { appRoutes } from "@/shared/constants/appRoutes";
import { thrownErrText } from "../clerk-errors";
import { hardNavigate } from "../hard-navigate";
import { splitName } from "../name";
import { isOauthSignUpAttempt } from "../oauth";
import { passwordLengthPlaceholder } from "../password";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

/**
 * After Google/Microsoft, Clerk sometimes still wants a name (or, rarely,
 * a password) before the user exists. Collect only what's missing, then
 * send them to company creation.
 */
export function SignUpContinue() {
  const t = useTranslations("auth.signUp");
  const clerk = useClerk();
  const ready = clerk.loaded;
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  const signUp = ready ? clerk.client.signUp : null;
  const missing = new Set((signUp?.missingFields ?? []) as string[]);
  const needsName = missing.has("first_name") || missing.has("last_name");
  const needsPassword = missing.has("password");
  const needsLegal = missing.has("legal_accepted");

  async function finish(createdSessionId: string) {
    await clerk.setActive({ session: createdSessionId });
    hardNavigate(appRoutes.onboarding);
  }

  async function complete(update: { firstName?: string; lastName?: string; password?: string; legalAccepted?: boolean }) {
    if (!signUp) return;
    const result = await signUp.update(update);
    if (result.status === "complete" && result.createdSessionId) {
      await finish(result.createdSessionId);
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!ready || attempted.current) return;
    const current = clerk.client.signUp;
    if (current.status === "complete" && current.createdSessionId) {
      attempted.current = true;
      void finish(current.createdSessionId);
      return;
    }
    if (!current.status || current.status === "abandoned") {
      hardNavigate("/sign-up");
      return;
    }
    if (!isOauthSignUpAttempt(current)) {
      hardNavigate("/sign-up");
      return;
    }
    const leftover = new Set(current.missingFields ?? []);
    leftover.delete("legal_accepted");
    if (leftover.size === 0 && (current.missingFields ?? []).includes("legal_accepted")) {
      attempted.current = true;
      void complete({ legalAccepted: true }).catch((err) => {
        attempted.current = false;
        setError(thrownErrText(err));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, clerk]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ready || !signUp) return;
    setBusy(true);
    try {
      const { firstName, lastName } = splitName(fullName);
      const done = await complete({
        ...(needsName ? { firstName, lastName } : {}),
        ...(needsPassword ? { password } : {}),
        ...(needsLegal ? { legalAccepted: true } : {}),
      });
      if (!done) {
        setError("We couldn't finish creating your account. Mind trying again?");
      }
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <MinimalShell heading={t("titleFinishProfile")} width="sm">
        <div className="flex justify-center py-4">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      </MinimalShell>
    );
  }

  return (
    <MinimalShell heading={t("titleFinishProfile")} sub={t("subtitleFinishProfile")} width="sm" stepKey="oauth-continue">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <FieldGroup>
          {needsName ? (
            <Field className="!gap-1">
              <FieldLabel htmlFor="full-name" required>
                {t("fullNameLabel")}
              </FieldLabel>
              <Input
                id="full-name"
                autoComplete="name"
                required
                placeholder={t("fullNamePlaceholder")}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoFocus
                className="h-10"
              />
            </Field>
          ) : null}
          {needsPassword ? (
            <Field data-invalid={Boolean(error)} className="!gap-1">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="password" required>
                  {t("setPassword")}
                </FieldLabel>
                <PasswordStrengthMeter password={password} />
              </div>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                placeholder={passwordLengthPlaceholder()}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                className="h-10"
              />
            </Field>
          ) : null}
        </FieldGroup>
        <FieldErrorText>{error}</FieldErrorText>
        <div id="clerk-captcha" className="empty:hidden" />
        <LoadingButton type="submit" pending={busy} className={`h-11 w-full ${onboarding3dButton}`}>
          {busy ? t("creatingAccount") : t("continueButton")}
        </LoadingButton>
        <TermsConsentLine action={t("consentAction")} />
      </form>
    </MinimalShell>
  );
}
