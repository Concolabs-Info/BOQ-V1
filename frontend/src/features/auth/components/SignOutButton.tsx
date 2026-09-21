"use client";

import { useClerk } from "@clerk/nextjs";
import { signOutAndGo } from "../hard-navigate";
import { appRoutes } from "@/shared/constants/appRoutes";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const clerk = useClerk();

  const defaultClassName =
    "inline-flex items-center justify-center rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <button type="button" className={className || defaultClassName} onClick={() => void signOutAndGo(clerk, appRoutes.login)}>
      Sign Out
    </button>
  );
}
