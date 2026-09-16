import type { ReactNode } from "react";
import { QuantoMark } from "./formBits";

export function OnboardingShell({
  rail,
  heading,
  sub,
  mobileHint,
  children,
}: {
  rail: ReactNode;
  heading: string;
  sub?: string;
  mobileHint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-y-auto bg-[#eef3f8] font-[var(--autoboq-font-sans)] md:flex-row md:gap-2 md:p-2">
      <aside className="relative hidden w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-slate-950 px-8 py-9 text-white md:flex md:w-[340px] lg:w-[376px]">
        <div className="flex items-center gap-3">
          <QuantoMark />
          <div>
            <p className="text-sm font-semibold tracking-tight">Quanto</p>
            <p className="text-xs text-slate-400">BOQ production workspace</p>
          </div>
        </div>
        <div className="mt-16 flex-1">{rail}</div>
        <p className="text-xs leading-5 text-slate-500">
          Upload drawings, run the takeoff, price the bill. One workspace per project.
        </p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col gap-2 md:hidden">
            <div className="flex items-center gap-3">
              <QuantoMark className="h-9 w-9" />
              <p className="text-sm font-semibold text-slate-950">Quanto</p>
            </div>
            {mobileHint ? <span className="text-xs text-slate-500">{mobileHint}</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{heading}</h1>
            {sub ? <p className="text-sm leading-6 text-slate-500">{sub}</p> : null}
          </div>
          <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">{children}</section>
        </div>
      </div>
    </div>
  );
}
