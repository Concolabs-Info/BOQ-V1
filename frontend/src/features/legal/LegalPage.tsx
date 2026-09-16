import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/features/brand/BrandLockup";

const BACK: Record<string, { href: string; label: string }> = {
  "sign-up": { href: "/sign-up", label: "Back to sign up" },
  "sign-in": { href: "/sign-in", label: "Back to sign in" },
  onboarding: { href: "/onboarding", label: "Back to setup" },
};

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
  const raw = (await searchParams).from;
  const key = Array.isArray(raw) ? raw[0] : raw;
  const back = (key && BACK[key]) || BACK["sign-in"];

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col gap-8 overflow-y-auto bg-[#eef3f8] px-6 py-16 font-[var(--autoboq-font-sans)]">
      <header className="flex flex-col gap-2">
        <Link href={back.href} className="w-fit opacity-90 transition-opacity hover:opacity-100">
          <BrandLockup />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {updated ? <p className="text-sm text-slate-500">Last updated {updated}</p> : null}
      </header>
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-950 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <footer className="mt-auto border-t border-slate-200 pt-6 text-sm">
        <Link href={back.href} className="font-medium text-blue-700 underline underline-offset-2 hover:no-underline">
          {back.label}
        </Link>
      </footer>
    </div>
  );
}
