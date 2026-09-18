"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSession } from "@clerk/nextjs";
import { Button } from "@/shared/components/Button";
import { AuthField } from "@/features/auth/components/AuthField";
import { SecuredByClerk } from "@/features/auth/components/SecuredByClerk";

type ReverificationLevel = "first_factor" | "second_factor" | "multi_factor";
type Factor = "password" | "email_code";

export function ReverificationDialog({
  level,
  reason,
  onVerified,
  onCancel,
}: {
  level: ReverificationLevel | undefined;
  /** Short phrase completing "so we can ...", e.g. "change your password". */
  reason: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const { session } = useSession();
  const startedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [safeIdentifier, setSafeIdentifier] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || startedRef.current) return;
    startedRef.current = true;

    async function start() {
      try {
        const result = await session!.startVerification({ level: level ?? "first_factor" });
        if (result.status !== "needs_first_factor") {
          setError("This can't be verified here. Sign out and back in, then try again.");
          return;
        }
        const factors = result.supportedFirstFactors ?? [];
        const password = factors.find((item) => item.strategy === "password");
        if (password) {
          setFactor("password");
          return;
        }
        const emailCode = factors.find((item) => item.strategy === "email_code");
        if (emailCode) {
          await session!.prepareFirstFactorVerification({
            strategy: "email_code",
            emailAddressId: emailCode.emailAddressId,
          });
          setFactor("email_code");
          setSafeIdentifier(emailCode.safeIdentifier);
          return;
        }
        setError("Your account doesn't support verifying this way yet.");
      } catch {
        setError("Couldn't start verification. Try again.");
      } finally {
        setReady(true);
      }
    }

    void start();
  }, [session, level]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || !factor || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (factor === "password") {
        await session.attemptFirstFactorVerification({ strategy: "password", password: value });
      } else {
        await session.attemptFirstFactorVerification({ strategy: "email_code", code: value.trim() });
      }
      onVerified();
    } catch {
      setError(factor === "password" ? "That password didn't work." : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="reverify-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="reverify-title" className="text-lg font-semibold text-slate-950">
          Confirm it&apos;s you
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {factor === "email_code"
            ? `Enter the code we sent to ${safeIdentifier ?? "your email"} so we can ${reason}.`
            : `This is a sensitive change, so enter your current password so we can ${reason}.`}
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            {factor ? (
              <AuthField
                id="reverify-value"
                label={factor === "password" ? "Password" : "Verification code"}
                type={factor === "password" ? "password" : "text"}
                inputMode={factor === "email_code" ? "numeric" : undefined}
                autoComplete={factor === "password" ? "current-password" : "one-time-code"}
                required
                autoFocus
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="h-10 flex-1 rounded-xl" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
              {factor ? (
                <Button type="submit" className="h-10 flex-1 rounded-xl" disabled={busy || !value.trim()} pending={busy}>
                  {busy ? "Verifying…" : "Continue"}
                </Button>
              ) : null}
            </div>
          </form>
        )}
        <SecuredByClerk />
      </div>
    </div>
  );
}
