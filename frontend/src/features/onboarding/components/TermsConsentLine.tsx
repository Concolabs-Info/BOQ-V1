"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { currentReturnTo, privacyHref, termsHref } from "@/features/legal/returnTo";

/**
 * Notion-style implicit consent: a quiet line under the primary action,
 * not a checkbox or a blocking screen. Acceptance is still recorded
 * server-side when the company is created.
 */
export function TermsConsentLine({ action }: { action: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = currentReturnTo(pathname, searchParams.toString());
  return (
    <p className="mx-auto max-w-xs text-center text-xs leading-5 text-muted-foreground">
      By {action}, you agree to Quanto&rsquo;s{" "}
      <Link href={termsHref(returnTo)} className="font-medium underline underline-offset-4 hover:text-primary">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href={privacyHref(returnTo)} className="font-medium underline underline-offset-4 hover:text-primary">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
