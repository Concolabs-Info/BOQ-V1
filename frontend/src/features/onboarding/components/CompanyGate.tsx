"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { claimInvitation } from "@/features/onboarding/api";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { appRoutes } from "@/shared/constants/appRoutes";
import { removeCachedJson, setSessionTokenGetter } from "@/shared/services/apiClient";

const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/login", "/forgot-password", "/help", "/legal"];
const ME_PATH = "/api/v1/platform/me";

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

    async function resolveMembership() {
      let context = await getPlatformContext();
      if (!context.organization) {
        const inviteToken = new URLSearchParams(window.location.search).get("invite");
        try {
          const claimed = await claimInvitation(inviteToken);
          if (claimed.claimed) {
            removeCachedJson(ME_PATH);
            context = await getPlatformContext();
          }
        } catch {
          // No pending invite, or it is no longer valid — fall through to onboarding.
        }
      }
      if (!mounted) return;
      if (context.organization) {
        if (isOnboardingPath(pathname) && context.membership_role !== "admin") {
          router.replace(appRoutes.projects);
          return;
        }
        setReady(true);
        return;
      }
      if (!isOnboardingPath(pathname)) {
        router.replace(appRoutes.onboarding);
        return;
      }
      setReady(true);
    }

    resolveMembership().catch(() => {
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
