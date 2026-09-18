"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RETURN_TO_KEY, resolveLegalBack, safeReturnPath, backLabel } from "./returnTo";

export function LegalBackLink({
  from,
  className,
  children,
}: {
  from?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [back, setBack] = useState(() => resolveLegalBack(from));

  useEffect(() => {
    const fromQuery = resolveLegalBack(from);
    const fromPath = safeReturnPath(from);
    if (fromPath) {
      try {
        sessionStorage.setItem(RETURN_TO_KEY, fromPath);
      } catch {
        // ignore
      }
      setBack(fromQuery);
      return;
    }
    try {
      const stored = sessionStorage.getItem(RETURN_TO_KEY);
      const href = safeReturnPath(stored ?? undefined);
      if (href) {
        setBack({ href, label: backLabel(href) });
        return;
      }
    } catch {
      // ignore
    }
    setBack(fromQuery);
  }, [from]);

  return (
    <Link href={back.href} className={className}>
      {children ?? back.label}
    </Link>
  );
}
