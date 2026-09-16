"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "./BrandLockup";
import { DitherBackground } from "./DitherBackground";

export function SplitPane({
  rail,
  heading,
  sub,
  mobileHint,
  from,
  children,
}: {
  rail: ReactNode;
  heading: string;
  sub?: string;
  mobileHint?: string;
  from?: "sign-in" | "sign-up" | "onboarding";
  children: ReactNode;
}) {
  const query = from ? `?from=${from}` : "";
  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-y-auto bg-[#eef3f8] font-[var(--autoboq-font-sans)] md:flex-row md:gap-2 md:p-2">
      <aside className="relative hidden w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-950 px-8 py-9 text-white md:flex md:w-[340px] lg:w-[376px]">
        <DitherBackground className="pointer-events-none absolute inset-0 size-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/55 to-transparent" />
        <div className="relative">
          <BrandLockup dark />
        </div>
        <div className="relative mt-16 flex-1">{rail}</div>
        <div className="relative flex items-center justify-between text-xs text-slate-500">
          <Link href={`/legal/terms${query}`} className="hover:text-slate-300">
            Terms of Service
          </Link>
          <Link href={`/help${query}`} className="hover:text-slate-300">
            Help Center
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 md:rounded-2xl">
        <div className="flex w-full max-w-md flex-col gap-6">
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
