"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const { signOut } = useClerk();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace(appRoutes.login);
  }

  const defaultClassName =
    "inline-flex items-center justify-center rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <button type="button" className={className || defaultClassName} onClick={handleSignOut}>
      Sign Out
    </button>
  );
}
