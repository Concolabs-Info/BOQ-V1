"use client";

import { useUser } from "@clerk/nextjs";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { SettingsCard, SettingsStack } from "./SettingsCard";

export function AccountProfileForm() {
  const { user, isLoaded } = useUser();
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (user) setFullName(user.fullName || "");
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const parts = fullName.trim().split(/\s+/);
      await user.update({
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
      });
      setNote("Profile updated.");
    } catch {
      setError("Clerk could not update your name. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!isLoaded) return <LoadingState label="Loading account" />;
  if (!user) return <ErrorMessage message="Sign in to manage your account." />;

  return (
    <form onSubmit={(event) => void submit(event)}>
      <SettingsStack>
        {error ? <ErrorMessage message={error} /> : null}
        {note ? <p className="text-sm font-medium text-emerald-700">{note}</p> : null}
        <SettingsCard
          title="Profile"
          description="Your name is stored with Clerk and shown to people in this company."
          footer={
            <Button type="submit" className="rounded-xl" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          }
        >
          <FieldLabel htmlFor="account-name">Full name</FieldLabel>
          <input
            id="account-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email</p>
          <p className="mt-2 text-sm text-slate-700">{user.primaryEmailAddress?.emailAddress || "—"}</p>
        </SettingsCard>
      </SettingsStack>
    </form>
  );
}

export function AccountSecurityCard() {
  return (
    <SettingsStack>
      <SettingsCard
        title="Password and access"
        description="Sign-in, password, and two-factor authentication stay with Clerk. Invitations also go through Clerk, not a separate email provider."
        footer={<SignOutButton className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" />}
      >
        <p className="text-sm leading-6 text-slate-500">
          Use Clerk’s account menu from the sign-in page if you need to reset a password or add two-factor authentication.
        </p>
      </SettingsCard>
    </SettingsStack>
  );
}
