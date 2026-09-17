"use client";

import { useCallback, useState } from "react";
import { useClerk } from "@clerk/nextjs";

export function useClerkAccount() {
  const clerk = useClerk();
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    await clerk.user?.reload();
    setTick((n) => n + 1);
  }, [clerk.user]);

  return {
    clerk,
    user: clerk.user,
    loaded: clerk.loaded,
    refresh,
  };
}
