"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { currentReturnTo, isHelpOrLegalPath, RETURN_TO_KEY } from "./returnTo";

export function RememberReturnPath() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isHelpOrLegalPath(pathname)) return;
    const next = currentReturnTo(pathname, searchParams.toString());
    try {
      sessionStorage.setItem(RETURN_TO_KEY, next);
    } catch {
      // sessionStorage can be unavailable; query-string from= still works
    }
  }, [pathname, searchParams]);

  return null;
}
