"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { claimInvitation } from "@/features/onboarding/api";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { appRoutes } from "@/shared/constants/appRoutes";
import { setSessionTokenGetter } from "@/shared/services/apiClient";

const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/login", "/forgot-password", "/help", "/legal"];

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
      if (!mounted) return;

      if (!context.organization) {
        const inviteToken = new URLSearchParams(window.location.search).get("invite");
        try {
          const claimed = await claimInvitation(inviteToken);
          if (claimed.claimed || claimed.already_member) {
            context = await getPlatformContext();
          }
        } catch {
          // Expired or missing invites fall through to onboarding, which
          // still prefers ACCEPT_INVITE when a pending invite exists.
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
