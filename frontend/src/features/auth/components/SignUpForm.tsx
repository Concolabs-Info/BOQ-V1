"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { SplitPane } from "@/features/brand/SplitPane";
import { BrandRailNote, OnboardingStepper } from "@/features/onboarding/components/OnboardingStepper";
import { FLOW_STEPS } from "@/features/onboarding/types";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { AuthField } from "./AuthField";
import { SecuredByClerk } from "./SecuredByClerk";
import { thrownErrText } from "../clerk-errors";
import { hardNavigate } from "../hard-navigate";
import { signOutIfSignedIn } from "../sign-out-if-signed-in";

export function SignUpForm({ invitationTicket }: { invitationTicket?: string } = {}) {
  const clerk = useClerk();
  const ready = clerk.loaded;
  const joining = Boolean(invitationTicket);

  const [step, setStep] = useState<"details" | "code">("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const releasedSession = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const signUp = clerk.client.signUp;
    if (signUp.status && signUp.status !== "complete" && signUp.emailAddress && signUp.unverifiedFields.includes("email_address")) {
      setEmail(signUp.emailAddress);
      setStep("code");
    }
  }, [ready, clerk]);

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

  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ready) return;
    setBusy(true);
    try {
      const signUp = clerk.client.signUp;
      if (invitationTicket) {
        await signOutIfSignedIn(clerk);
        const result = await signUp.create({
          strategy: "ticket",
          ticket: invitationTicket,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        if (result.status === "complete" && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
          hardNavigate(appRoutes.projects);
          return;
        }
        setError("We couldn't finish joining. Try the invite link again.");
        return;
      }
      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("code");
    } catch (err) {
      setError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const entered = code.trim();
    if (entered.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (!ready) return;

    setBusy(true);
    try {
      const result = await clerk.client.signUp.attemptEmailAddressVerification({
        code: entered,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        hardNavigate(appRoutes.onboarding);
        return;
      }

      if (result.unverifiedFields.includes("email_address")) {
        setError("That code didn't match. Request a new one and try again.");
      } else if (result.missingFields.length > 0) {
        const extra = result.missingFields.filter((field) => field !== "email_address");
        if (extra.some((field) => field.includes("organization"))) {
          setError("Clerk Organizations must be off. Quanto stores the company in our database after this step.");
        } else {
          setError(
            `Your Clerk instance still needs: ${result.missingFields.join(", ")}. Turn extra fields off in Clerk so email + password is enough.`,
          );
        }
      } else {
        setError("We couldn't finish creating your account. Try again.");
      }
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

  const isCode = step === "code";

  return (
    <SplitPane
      from="sign-up"
      rail={isCode ? <OnboardingStepper current={0} /> : <BrandRailNote />}
      heading={
        isCode ? "Check your email" : joining ? "Accept your invitation" : "Let's get your company set up on Quanto"
      }
      sub={
        isCode
          ? `Enter the 6-digit code we sent to ${email}.`
          : joining
            ? "Set your name and password to join the company. Your email is already confirmed."
            : "Start with your work email. We'll take it from there."
      }
      mobileHint={isCode ? `Step 1 of ${FLOW_STEPS.length}` : undefined}
    >
      {isCode ? (
        <div className="flex flex-col gap-5">
          <form onSubmit={(event) => void submitCode(event)} className="flex flex-col gap-4">
            <AuthField
              id="code"
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              error={error ?? undefined}
              autoFocus
            />
            <Button type="submit" disabled={busy || !ready} className="h-11 w-full rounded-xl">
              {busy ? "Verifying…" : "Verify email"}
            </Button>
          </form>
          {notice ? <p className="text-sm text-slate-500">{notice}</p> : null}
          <button
            type="button"
            onClick={() => void resend()}
            disabled={busy || !ready}
            className="self-start text-sm font-medium text-blue-700 underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            Send a new code
          </button>
          <SecuredByClerk />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <form onSubmit={(event) => void submitDetails(event)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <AuthField
                id="first-name"
                label="First name"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoFocus
              />
              <AuthField
                id="last-name"
                label="Last name"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            {joining ? null : (
              <AuthField
                id="email"
                label="Work email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
            <AuthField
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={joining ? undefined : (error ?? undefined)}
            />
            {joining && error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div id="clerk-captcha" />
            <Button type="submit" disabled={busy || !ready} className="h-11 w-full rounded-xl">
              {busy ? (joining ? "Joining…" : "Creating account…") : joining ? "Join company" : "Continue"}
            </Button>
          </form>
          {joining && notice ? <p className="text-sm text-slate-500">{notice}</p> : null}
          {joining ? null : (
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-blue-700 hover:underline">
                Sign in
              </Link>
            </p>
          )}
          <SecuredByClerk />
        </div>
      )}
    </SplitPane>
  );
}
