"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { signOutAndGo } from "@/features/auth/hard-navigate";

export function SignedInAs() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  if (!isLoaded || !user) return null;

  const email = user.primaryEmailAddress?.emailAddress ?? user.username ?? "";

  return (
    <p className="text-xs text-slate-500">
      Signed in{email ? ` as ${email}` : ""}.{" "}
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
