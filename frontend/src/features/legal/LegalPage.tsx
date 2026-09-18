import type { ReactNode } from "react";
import { BrandLockup } from "@/features/brand/BrandLockup";
import { firstParam } from "@/features/auth/url";
import { LegalBackLink } from "./LegalBackLink";

export async function LegalPage({
  title,
  updated,
  searchParams,
  children,
}: {
  title: string;
  updated?: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  children: ReactNode;
}) {
  const from = firstParam((await searchParams).from);

  return (
    <div className="min-h-dvh bg-[#eef3f8] font-[var(--autoboq-font-sans)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <LegalBackLink from={from} className="w-fit opacity-90 transition-opacity hover:opacity-100">
            <BrandLockup />
          </LegalBackLink>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {updated ? <p className="text-sm text-slate-500">Last updated {updated}</p> : null}
        </header>
        <div className="flex flex-col gap-5 text-sm leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline [&_em]:italic [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-950 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-950 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_strong]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
        <footer className="mt-auto border-t border-slate-200 pt-6 text-sm">
          <LegalBackLink from={from} className="font-medium text-blue-700 underline underline-offset-2 hover:no-underline" />
        </footer>
      </div>
    </div>
  );
}
