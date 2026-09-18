"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLockup } from "./BrandLockup";
import { currentReturnTo, helpHref, termsHref } from "@/features/legal/returnTo";

function LegalFooterLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = currentReturnTo(pathname, searchParams.toString());
  return (
    <>
      <Link href={termsHref(returnTo)} className="hover:text-slate-300">
        Terms of Service
      </Link>
      <Link href={helpHref(returnTo)} className="hover:text-slate-300">
        Help Center
      </Link>
    </>
  );
}

export function SplitPane({
  rail,
  heading,
  sub,
  mobileHint,
  layout = "form",
  children,
}: {
  rail: ReactNode;
  heading: string;
  sub?: string;
  mobileHint?: string;
  from?: "sign-in" | "sign-up" | "onboarding";
  layout?: "form" | "document";
  children: ReactNode;
}) {
  const documentLayout = layout === "document";
  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#eef3f8] font-[var(--autoboq-font-sans)] md:flex-row md:gap-2 md:p-2">
      <aside className="hidden min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-950 px-8 py-9 text-white md:flex md:w-[340px] lg:w-[376px]">
        <BrandLockup dark />
        <div className="mt-16 min-h-0 flex-1 overflow-y-auto">{rail}</div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <Suspense
            fallback={
              <>
                <Link href="/legal/terms" className="hover:text-slate-300">
                  Terms of Service
                </Link>
                <Link href="/help" className="hover:text-slate-300">
                  Help Center
                </Link>
              </>
            }
          >
            <LegalFooterLinks />
          </Suspense>
        </div>
      </aside>

      <div
        className={`flex min-h-0 flex-1 flex-col items-center px-6 ${
          documentLayout ? "justify-start overflow-hidden py-8 md:py-10" : "justify-center overflow-y-auto py-12"
        }`}
      >
        <div className={`flex w-full flex-col ${documentLayout ? "min-h-0 max-w-xl flex-1 gap-4" : "max-w-md gap-6"}`}>
          <div className="flex flex-col gap-2 md:hidden">
            <BrandLockup />
            {mobileHint ? <span className="text-xs text-slate-500">{mobileHint}</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{heading}</h1>
            {sub ? <p className="text-sm leading-6 text-slate-500">{sub}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
