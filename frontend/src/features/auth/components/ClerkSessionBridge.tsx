"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, type ReactNode } from "react";
import { setSessionTokenGetter } from "@/shared/services/apiClient";

export function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  // Set synchronously during render, not inside a useEffect: React commits
  // child effects before parent effects, so a fresh mount (e.g. landing on
  // /onboarding right after sign-up) could let a child's own effect fire an
  // API call before this one ever registered the token getter, sending an
  // unauthenticated request and surfacing as "Please sign in again." until
  // the next reload set it in time.
  setSessionTokenGetter(() => getToken());

  useEffect(() => {
    return () => setSessionTokenGetter(null);
  }, []);

  return <>{children}</>;
}
