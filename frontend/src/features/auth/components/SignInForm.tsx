"use client";
import { FieldErrorText } from "@/shared/components/FieldErrorText";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useClerk } from "@clerk/nextjs";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingButton } from "@/components/ui/loading-button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { MinimalShell } from "@/features/onboarding/components/MinimalShell";
import { onboarding3dButton } from "@/features/onboarding/components/onboardingButtonStyle";
import { CodeField } from "./CodeField";
import { TermsConsentLine } from "@/features/onboarding/components/TermsConsentLine";
import { thrownErrText } from "../clerk-errors";
import { passwordLengthPlaceholder } from "../password";
import { hardNavigate } from "../hard-navigate";
import { signOutIfSignedIn } from "../sign-out-if-signed-in";

type Mode = "password" | "reset-request" | "reset-code" | "email-code" | "mfa";
type SignInResource = ReturnType<typeof useClerk>["client"]["signIn"];

export function SignInForm({
  redirectUrl,
  invitationTicket,
  switchAccount = false,
  initialEmail,
}: {
  redirectUrl?: string;
  invitationTicket?: string;
  switchAccount?: boolean;
  initialEmail?: string;
}) {
  const t = useTranslations("auth.signIn");
  const clerk = useClerk();
  const ready = clerk.loaded;
  const destination = invitationTicket ? appRoutes.onboarding : (redirectUrl ?? appRoutes.projects);
  const needsNoSession = Boolean(invitationTicket) || switchAccount;

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaKind, setMfaKind] = useState<"totp" | "phone_code" | "email_code">("totp");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ticketTried = useRef(false);
  const clearingSession = useRef(false);
  const landing = useRef(false);

  function land() {
    hardNavigate(destination);
  }

  async function enterSession(createdSessionId: string) {
    await clerk.setActive({ session: createdSessionId });
    land();
  }

  useEffect(() => {
    if (!ready || !clerk.session || needsNoSession || landing.current) return;
    landing.current = true;
    land();
  }, [ready, clerk.session, needsNoSession]);

  useEffect(() => {
    if (!ready || !needsNoSession || !clerk.session || clearingSession.current) return;
    clearingSession.current = true;
    void signOutIfSignedIn(clerk).finally(() => {
      clearingSession.current = false;
    });
  }, [ready, needsNoSession, clerk.session, clerk]);

  useEffect(() => {
    if (!ready || !invitationTicket || ticketTried.current || clerk.session) return;
    ticketTried.current = true;
    void (async () => {
      setBusy(true);
      setNotice("Accepting your invitation…");
      try {
        const result = await clerk.client.signIn.create({
          strategy: "ticket",
          ticket: invitationTicket,
        });
        if (result.status === "complete" && result.createdSessionId) {
          await enterSession(result.createdSessionId);
          return;
        }
        await routeNext(result);
      } catch (err) {
        setNotice(null);
        setError(thrownErrText(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [ready, invitationTicket, clerk.session]);

  async function routeNext(si: SignInResource) {
    if (si.status === "complete" && si.createdSessionId) {
      await enterSession(si.createdSessionId);
      return;
    }

    const status = String(si.status);
    if (status === "needs_client_trust") {
      const emailFactor = si.supportedSecondFactors?.find((factor) => factor.strategy === "email_code");
      if (emailFactor && "emailAddressId" in emailFactor && emailFactor.emailAddressId) {
        await si.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
        setMfaKind("email_code");
        setCode("");
        setNotice("New device. We emailed a 6-digit code to confirm it's you.");
        setMode("mfa");
        return;
      }
      setError("This device needs verifying, but no email method is available.");
      return;
    }

    if (si.status === "needs_second_factor") {
      const totp = si.supportedSecondFactors?.find((factor) => factor.strategy === "totp");
      const phone = si.supportedSecondFactors?.find((factor) => factor.strategy === "phone_code");
      if (totp) {
        setMfaKind("totp");
        setCode("");
        setNotice(null);
        setMode("mfa");
        return;
      }
      if (phone) {
        await si.prepareSecondFactor({ strategy: "phone_code" });
        setMfaKind("phone_code");
        setCode("");
        setNotice("We texted a code to the phone on your account.");
        setMode("mfa");
        return;
      }
      setError("Two-step sign-in is on for this account, but with no method we can use here.");
      return;
    }

    if (si.status === "needs_first_factor") {
      const emailCode = si.supportedFirstFactors?.find((factor) => factor.strategy === "email_code");
      if (emailCode && "emailAddressId" in emailCode && emailCode.emailAddressId) {
        await si.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCode.emailAddressId,
        });
        setCode("");
        setNotice("We emailed you a 6-digit code to confirm it's you.");
        setMode("email-code");
        return;
      }
      setError("That email and password don't match. Try again, or reset your password.");
      return;
    }

    if (status === "needs_new_password") {
      setNotice("You need to set a new password before signing in.");
      setError(null);
      setMode("reset-request");
      return;
    }

    setError(`Sign-in needs a step we don't handle here yet (${si.status ?? "unknown"}).`);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!ready) return;
    setBusy(true);
    try {
      let result = await clerk.client.signIn.create({ identifier: email.trim() });
      const canPassword = result.supportedFirstFactors?.some((factor) => factor.strategy === "password");
      if (result.status !== "complete" && canPassword) {
        result = await clerk.client.signIn.attemptFirstFactor({
          strategy: "password",
          password,
        });
      }
      await routeNext(result);
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event?: FormEvent, nextCode = code) {
    event?.preventDefault();
    setError(null);
    if (!ready || busy) return;
    const entered = nextCode.trim();
    if (entered.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const result = await clerk.client.signIn.attemptSecondFactor({
        strategy: mfaKind,
        code: entered,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await enterSession(result.createdSessionId);
        return;
      }
      setError("That code didn't work. Try again.");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitEmailCode(event?: FormEvent, nextCode = code) {
    event?.preventDefault();
    setError(null);
    if (!ready || busy) return;
    const entered = nextCode.trim();
    if (entered.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const result = await clerk.client.signIn.attemptFirstFactor({
        strategy: "email_code",
        code: entered,
      });
      await routeNext(result);
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!ready) return;
    setBusy(true);
    try {
      await clerk.client.signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setMode("reset-code");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ready) return;
    setBusy(true);
    try {
      const result = await clerk.client.signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password: newPassword,
      });
      await routeNext(result);
      if (result.status !== "complete" && result.status !== "needs_second_factor") {
        setError("Couldn't reset your password. Request a new code and try again.");
      }
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  function backToPassword() {
    setMode("password");
    setError(null);
    setNotice(null);
    setCode("");
  }

  const alreadyIn = ready && clerk.session && !invitationTicket && !switchAccount;

  let title = invitationTicket ? t("titleInvite") : t("titleDefault");
  let subtitle: string | undefined = invitationTicket
    ? t("subtitleInvite")
    : switchAccount
      ? t("subtitleSwitch")
      : redirectUrl
        ? t("subtitleRedirect")
        : t("subtitleDefault");

  if (alreadyIn) {
    subtitle = undefined;
  } else if (mode === "mfa") {
    if (mfaKind === "totp") {
      title = "Two-step verification";
      subtitle = "Enter the 6-digit code from your authenticator app.";
    } else if (mfaKind === "phone_code") {
      title = "Check your phone";
      subtitle = "We texted a code to the phone on your account.";
    } else {
      title = "Verify this device";
      subtitle = email ? `We emailed a 6-digit code to ${email}.` : "We emailed a 6-digit code to confirm it's you.";
    }
  } else if (mode === "email-code") {
    title = "Check your email";
    subtitle = email ? `We emailed a 6-digit code to ${email}.` : "Enter the 6-digit code we sent you.";
  } else if (mode === "reset-request") {
    title = "Reset your password";
    subtitle = notice ?? "Enter your email and we'll send a code.";
  } else if (mode === "reset-code") {
    title = "Set a new password";
    subtitle = `We sent a code to ${email}. Enter it with a new password.`;
  }

  let body: ReactNode;

  if (alreadyIn) {
    body = (
      <div className="flex flex-col items-center gap-5">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-lg font-medium leading-7 text-foreground"
        >
          {t("alreadySignedInBody")}
        </motion.p>
      </div>
    );
  } else if (mode === "mfa") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitMfa(event)} className="flex flex-col gap-5">
          <CodeField
            id="mfa-code"
            required
            value={code}
            onChange={setCode}
            onComplete={(next) => void submitMfa(undefined, next)}
            error={error ?? undefined}
            autoFocus
            disabled={busy}
          />
          <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
            {busy ? t("verifying") : t("verifyButton")}
          </LoadingButton>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("backToSignIn")}
        </button>
      </div>
    );
  } else if (mode === "email-code") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitEmailCode(event)} className="flex flex-col gap-5">
          <CodeField
            id="email-code"
            required
            value={code}
            onChange={setCode}
            onComplete={(next) => void submitEmailCode(undefined, next)}
            error={error ?? undefined}
            autoFocus
            disabled={busy}
          />
          <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
            {busy ? t("verifying") : t("verifyButton")}
          </LoadingButton>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("backToSignIn")}
        </button>
      </div>
    );
  } else if (mode === "reset-request") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void requestReset(event)} className="flex flex-col gap-5">
          <FieldGroup>
            <Field className="!gap-1">
              <FieldLabel htmlFor="email" required>{t("workEmail")}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email address..."
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                className="h-10"
              />
            </Field>
          </FieldGroup>
          <FieldErrorText>{error}</FieldErrorText>
          <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
            {busy ? t("sendingCode") : t("sendResetCode")}
          </LoadingButton>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("backToSignIn")}
        </button>
      </div>
    );
  } else if (mode === "reset-code") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitReset(event)} className="flex flex-col gap-5">
          <CodeField
            id="code"
            label="Reset code"
            required
            value={code}
            onChange={setCode}
            autoFocus
            disabled={busy}
          />
          <FieldGroup>
            <Field data-invalid={Boolean(error)} className="!gap-1">
              <FieldLabel htmlFor="new-password" required>{t("newPassword")}</FieldLabel>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                placeholder={passwordLengthPlaceholder()}
                required
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                className="h-10"
              />
              <FieldErrorText>{error}</FieldErrorText>
            </Field>
          </FieldGroup>
          <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
            {busy ? t("updatingPassword") : t("setNewPassword")}
          </LoadingButton>
        </form>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitPassword(event)} className="flex flex-col gap-5">
          <FieldGroup>
            <Field className="!gap-1">
              <FieldLabel htmlFor="email" required>{t("workEmail")}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email address..."
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus={!initialEmail}
                className="h-10"
              />
            </Field>
            <Field data-invalid={Boolean(error)} className="!gap-1">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="password" required>{t("password")}</FieldLabel>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset-request");
                    setError(null);
                    setNotice(null);
                  }}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("forgotPassword")}
                </button>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus={Boolean(initialEmail)}
                aria-invalid={Boolean(error)}
                className="h-10"
              />
              <FieldErrorText>{error}</FieldErrorText>
            </Field>
          </FieldGroup>
          <LoadingButton type="submit" pending={busy || !ready} className={`h-11 w-full ${onboarding3dButton}`}>
            {busy ? t("signingIn") : t("signInButton")}
          </LoadingButton>
        </form>
        <TermsConsentLine action={t("consentAction")} />
      </div>
    );
  }

  const footer =
    !alreadyIn && !invitationTicket && !switchAccount && mode === "password" ? (
      <>
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signUpLink")}
        </Link>
      </>
    ) : null;

  return (
    <MinimalShell
      heading={title}
      sub={subtitle}
      footer={footer}
      width="sm"
      stepKey={alreadyIn ? "already-in" : mode}
      card={!alreadyIn}
    >
      {body}
    </MinimalShell>
  );
}
