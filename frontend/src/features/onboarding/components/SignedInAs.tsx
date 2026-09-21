"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { signOutAndGo } from "@/features/auth/hard-navigate";

export function SignedInAs() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  if (!isLoaded || !user) return null;

  const email = user.primaryEmailAddress?.emailAddress ?? user.username ?? "";

  return (
    <p className="max-w-full text-pretty px-1 text-center text-xs text-slate-500">
      Signed in{email ? <> as <span className="break-all">{email}</span></> : ""}.{" "}
      <button
        type="button"
        onClick={() => void signOutAndGo(clerk)}
        className="font-medium text-slate-950 underline underline-offset-2 hover:no-underline"
      >
        Sign out
      </button>
    </p>
  );
}
