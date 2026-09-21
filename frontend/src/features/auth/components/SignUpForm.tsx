"use client";
import { FieldErrorText } from "@/shared/components/FieldErrorText";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useClerk } from "@clerk/nextjs";
import { MinimalShell } from "@/features/onboarding/components/MinimalShell";
import { onboarding3dButton } from "@/features/onboarding/components/onboardingButtonStyle";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingButton } from "@/components/ui/loading-button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { CodeField } from "./CodeField";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { TermsConsentLine } from "@/features/onboarding/components/TermsConsentLine";
import { isAccountExistsError, thrownErrText } from "../clerk-errors";
import { passwordLengthPlaceholder } from "../password";
import { hardNavigate } from "../hard-navigate";
import { splitName } from "../name";
import { isOauthSignUpAttempt, oauthPaths } from "../oauth";
import { canContinuePendingSignUp } from "../sign-up-email-start";
import { signOutIfSignedIn } from "../sign-out-if-signed-in";
import { SocialAuthButtons } from "./SocialAuthButtons";

// Practical check, not full RFC 5322 — catches the common slips (no "@",
// no dot in the domain, stray spaces) without rejecting real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Order for a fresh sign-up: email -> verify it's really theirs (code) ->
// name + password. Someone joining via an invite ticket skips straight to
// "details" — the ticket already carries a verified email.
type Step = "email" | "code" | "details";

export function SignUpForm({ invitationTicket }: { invitationTicket?: string } = {}) {
  const t = useTranslations("auth.signUp");
  const clerk = useClerk();
  const ready = clerk.loaded;
  const joining = Boolean(invitationTicket);

  const [step, setStep] = useState<Step>(joining ? "details" : "email");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const releasedSession = useRef(false);

  // Resume mid-flow (e.g. a page refresh) at whichever step Clerk's own
  // sign-up state says we're actually at. Only ever skip ahead of "email"
  // on proof the email was actually verified — a leftover/ambiguous
  // attempt (e.g. from a prior "that email's already in use" rejection)
  // must never silently skip past re-entering the email.
  useEffect(() => {
    if (!ready || joining) return;
    const signUp = clerk.client.signUp;
    if (!signUp.status || signUp.status === "complete") return;

    if (signUp.status === "missing_requirements" && isOauthSignUpAttempt(signUp)) {
      hardNavigate(oauthPaths.continueSignUp);
      return;
    }
    if (!signUp.emailAddress) return;

    if (signUp.verifications.emailAddress?.status === "verified") {
      setEmail(signUp.emailAddress);
      setStep("details");
    } else if (signUp.unverifiedFields.includes("email_address")) {
      setEmail(signUp.emailAddress);
      setStep("code");
    }
  }, [ready, clerk, joining]);

  useEffect(() => {
    if (!ready || !invitationTicket || releasedSession.current || !clerk.session) return;
    releasedSession.current = true;
    const previous = clerk.user?.primaryEmailAddress?.emailAddress;
    setBusy(true);
    void (async () => {
      try {
        await signOutIfSignedIn(clerk);
        setNotice(
          previous
            ? `Signed out of ${previous} so you can join with this invitation.`
            : "Signed out of the previous account so you can join with this invitation.",
        );
      } catch (err) {
        releasedSession.current = false;
        setError(thrownErrText(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [ready, invitationTicket, clerk]);

  async function finishSession(createdSessionId: string) {
    await clerk.setActive({ session: createdSessionId });
    hardNavigate(appRoutes.onboarding);
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setEmailError(null);
    setEmailExists(false);
    if (!ready) return;

    const cleanedEmail = email.trim();
    if (!EMAIL_PATTERN.test(cleanedEmail)) {
      setEmailError("Hmm, that doesn't look like a complete email address. Mind double-checking it?");
      return;
    }

    setBusy(true);
    try {
      const signUp = clerk.client.signUp;
      // Same email on an in-progress attempt: just resend the code. Calling
      // update() with that email is what Clerk reports as "identifier exists"
      // even though no User has been created yet (back from the code step,
      // a refresh, an abandoned start in this browser).
      if (!canContinuePendingSignUp(signUp, cleanedEmail)) {
        await signUp.create({ emailAddress: cleanedEmail });
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("code");
    } catch (err) {
      const signUp = clerk.client.signUp;
      if (isAccountExistsError(err) && canContinuePendingSignUp(signUp, cleanedEmail)) {
        try {
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          setStep("code");
        } catch (retryErr) {
          setError(thrownErrText(retryErr));
        }
      } else if (isAccountExistsError(err)) {
        setEmailExists(true);
      } else {
        setError(thrownErrText(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event?: FormEvent, nextCode = code) {
    event?.preventDefault();
    setError(null);
    setNotice(null);
    const entered = nextCode.trim();
    if (entered.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (!ready || busy) return;

    setBusy(true);
    try {
      const result = await clerk.client.signUp.attemptEmailAddressVerification({
        code: entered,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await finishSession(result.createdSessionId);
        return;
      }

      if (result.unverifiedFields.includes("email_address")) {
        setError("That code didn't match. Request a new one and try again.");
        return;
      }

      // Email's confirmed — on to name and password.
      setStep("details");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      setNotice("New code sent. Check your email.");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ready) return;
    setBusy(true);
    try {
      const signUp = clerk.client.signUp;
      const { firstName, lastName } = splitName(fullName);
      if (invitationTicket) {
        await signOutIfSignedIn(clerk);
        const result = await signUp.create({
          strategy: "ticket",
          ticket: invitationTicket,
          password,
          firstName,
          lastName,
        });
        if (result.status === "complete" && result.createdSessionId) {
          await finishSession(result.createdSessionId);
          return;
        }
        setError("We couldn't finish joining. Try the invite link again.");
        return;
      }

      // Email's already verified at this point — just fill in the rest.
      const result = await signUp.update({ password, firstName, lastName });
      if (result.status === "complete" && result.createdSessionId) {
        await finishSession(result.createdSessionId);
        return;
      }
      setError("We couldn't finish creating your account. Mind trying again?");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    !joining && step === "email" ? (
      <>
        {t("alreadyHaveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signInLink")}
        </Link>
      </>
    ) : null;

  let heading = t("titleDefault");
  let subtitle = t("subtitleDefault");
  if (joining) {
    heading = t("titleJoining");
    subtitle = t("subtitleJoining");
  } else if (step === "code") {
    heading = t("titleCode");
    subtitle = `Enter the 6-digit code we sent to ${email}.`;
  } else if (step === "details") {
    heading = t("titleAlmostThere");
    subtitle = t("subtitleAlmostThere");
  }

  return (
    <MinimalShell heading={heading} sub={subtitle} footer={footer} width="sm" stepKey={step}>
      {step === "email" ? (
        <div className="flex flex-col gap-5">
          <SocialAuthButtons
            intent="sign-up"
            disabled={busy || !ready}
            onError={(message) => {
              setEmailExists(false);
              setError(message);
            }}
          />
          <form onSubmit={(event) => void submitEmail(event)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(emailError)} className="!gap-1">
                <FieldLabel htmlFor="email" required>{t("workEmail")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError(null);
                    if (emailExists) setEmailExists(false);
                  }}
                  aria-invalid={Boolean(emailError)}
                  autoFocus
                  className="h-10"
                />
                <FieldErrorText>{emailError}</FieldErrorText>
              </Field>
            </FieldGroup>
            {emailExists ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {t("accountExists")}{" "}
                <Link
                  href={`/sign-in?email=${encodeURIComponent(email.trim())}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("accountExistsLink")}
                </Link>
              </p>
            ) : (
              <FieldErrorText>{error}</FieldErrorText>
            )}
            <div id="clerk-captcha" className="empty:hidden" />
            <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
              {busy ? t("sendingCode") : t("continueButton")}
            </LoadingButton>
          </form>
          <TermsConsentLine action={t("consentAction")} />
        </div>
      ) : step === "code" ? (
        <div className="flex flex-col gap-5">
          <form onSubmit={(event) => void submitCode(event)} className="flex flex-col gap-5">
            <CodeField
              id="code"
              required
              value={code}
              onChange={(next) => {
                setCode(next);
                setError(null);
              }}
              onComplete={(next) => void submitCode(undefined, next)}
              error={error ?? undefined}
              autoFocus
              disabled={busy}
            />
            <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
              {busy ? t("verifying") : t("verifyEmail")}
            </LoadingButton>
          </form>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy || !ready}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t("sendNewCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setStep("email");
              }}
              disabled={busy}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:underline hover:text-foreground disabled:opacity-50"
            >
              {t("notYourEmail")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <form onSubmit={(event) => void submitDetails(event)} className="flex flex-col gap-4">
            <FieldGroup>
              <Field className="!gap-1">
                <FieldLabel htmlFor="full-name" required>{t("fullNameLabel")}</FieldLabel>
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
              <Field data-invalid={Boolean(error)} className="!gap-1">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="password" required>{t("setPassword")}</FieldLabel>
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
                <FieldErrorText>{error}</FieldErrorText>
              </Field>
            </FieldGroup>
            <div id="clerk-captcha" className="empty:hidden" />
            <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
              {busy ? t("creatingAccount") : t("continueButton")}
            </LoadingButton>
          </form>
          {joining && notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          {joining ? <TermsConsentLine action={t("consentAction")} /> : null}
        </div>
      )}
    </MinimalShell>
  );
}
