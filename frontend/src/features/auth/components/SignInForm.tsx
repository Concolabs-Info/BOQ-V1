"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { claimInvitationWithSession } from "@/features/onboarding/api";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";
import { CodeField } from "./CodeField";
import { SecuredByClerk } from "./SecuredByClerk";
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
}: {
  redirectUrl?: string;
  invitationTicket?: string;
  switchAccount?: boolean;
}) {
  const clerk = useClerk();
  const ready = clerk.loaded;
  const destination = invitationTicket ? appRoutes.projects : (redirectUrl ?? appRoutes.projects);
  const needsNoSession = Boolean(invitationTicket) || switchAccount;

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
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
    if (invitationTicket) {
      await claimInvitationWithSession(() => clerk.session?.getToken() ?? Promise.resolve(null));
    }
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

  let title = invitationTicket ? "Accept your invitation" : "Welcome back to Quanto";
  let subtitle = invitationTicket
    ? "Signing you in to join the company."
    : switchAccount
      ? "Sign in with a different account."
      : redirectUrl
        ? "Sign in to pick up where you left off."
        : "Sign in to your company workspace.";

  if (alreadyIn) {
    subtitle = "You're already signed in. Taking you to your workspace…";
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
    body = null;
  } else if (mode === "mfa") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitMfa(event)} className="flex flex-col gap-4">
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
          <Button type="submit" pending={busy || !ready} className="h-11 w-full rounded-xl">
            {busy ? "Verifying…" : "Verify and sign in"}
          </Button>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-blue-700 underline underline-offset-2 hover:no-underline">
          Back to sign in
        </button>
        <SecuredByClerk />
      </div>
    );
  } else if (mode === "email-code") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitEmailCode(event)} className="flex flex-col gap-4">
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
          <Button type="submit" pending={busy || !ready} className="h-11 w-full rounded-xl">
            {busy ? "Verifying…" : "Verify and sign in"}
          </Button>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-blue-700 underline underline-offset-2 hover:no-underline">
          Back to sign in
        </button>
        <SecuredByClerk />
      </div>
    );
  } else if (mode === "reset-request") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void requestReset(event)} className="flex flex-col gap-4">
          <AuthField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" pending={busy || !ready} className="h-11 w-full rounded-xl">
            {busy ? "Sending…" : "Send reset code"}
          </Button>
        </form>
        <button type="button" onClick={backToPassword} className="self-start text-sm font-medium text-blue-700 underline underline-offset-2 hover:no-underline">
          Back to sign in
        </button>
        <SecuredByClerk />
      </div>
    );
  } else if (mode === "reset-code") {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitReset(event)} className="flex flex-col gap-4">
          <CodeField
            id="code"
            label="Reset code"
            required
            value={code}
            onChange={setCode}
            autoFocus
            disabled={busy}
          />
          <AuthField
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder={passwordLengthPlaceholder()}
            required
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
          />
          <Button type="submit" pending={busy || !ready} className="h-11 w-full rounded-xl">
            {busy ? "Updating…" : "Set new password"}
          </Button>
        </form>
        <SecuredByClerk />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void submitPassword(event)} className="flex flex-col gap-4">
          <AuthField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          <AuthField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
            hint={
              <button
                type="button"
                onClick={() => {
                  setMode("reset-request");
                  setError(null);
                  setNotice(null);
                }}
                className="text-sm text-slate-500 hover:text-slate-950"
              >
                Forgot password?
              </button>
            }
          />
          <Button type="submit" pending={busy || !ready} className="h-11 w-full rounded-xl">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-sm text-slate-500">
          New to Quanto?{" "}
          <Link href="/sign-up" className="font-medium text-blue-700 hover:underline">
            Create an account
          </Link>
        </p>
        <SecuredByClerk />
      </div>
    );
  }

  return (
    <AuthShell title={title} subtitle={subtitle} from="sign-in">
      {body}
    </AuthShell>
  );
}
