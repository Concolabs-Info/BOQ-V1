"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { appRoutes } from "@/shared/constants/appRoutes";
import { setSessionTokenGetter } from "@/shared/services/apiClient";

const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/login", "/forgot-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isOnboardingPath(pathname: string) {
  return pathname === appRoutes.onboarding || pathname.startsWith(`${appRoutes.onboarding}/`);
}

export function CompanyGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(isPublicPath(pathname));

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || isPublicPath(pathname)) {
      setReady(true);
      return;
    }

    let mounted = true;
    setReady(false);
    setSessionTokenGetter(() => getToken());
    getPlatformContext()
      .then((context) => {
        if (!mounted) return;
        if (!context.organization && !isOnboardingPath(pathname)) {
          router.replace(appRoutes.onboarding);
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [getToken, isLoaded, isSignedIn, pathname, router]);

  if (!isLoaded) return null;
  if (!isPublicPath(pathname) && isSignedIn && !ready) return null;
  return <>{children}</>;
}
