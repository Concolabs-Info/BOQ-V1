"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, type ReactNode } from "react";
import { setSessionTokenGetter } from "@/shared/services/apiClient";

export function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setSessionTokenGetter(() => getToken());
    return () => setSessionTokenGetter(null);
  }, [getToken]);

  return <>{children}</>;
}
