"use client";

import { useUser } from "@clerk/nextjs";
import { SignOutButton } from "@/features/auth/components/SignOutButton";

export function SignedInAs() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <p className="truncate text-xs text-slate-500">Signed in as {email}</p>
      <SignOutButton className="text-xs font-medium text-slate-500 hover:text-slate-950" />
    </div>
  );
}
