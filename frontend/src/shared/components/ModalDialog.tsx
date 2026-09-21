"use client";

import type { ReactNode } from "react";

export function ModalDialog({
  open,
  title,
  description,
  ariaLabel,
  maxWidth = "max-w-md",
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  ariaLabel?: string;
  maxWidth?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={ariaLabel || title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <section className={`relative flex max-h-[86vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p> : null}
          </div>
          <button type="button" className="text-2xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">x</button>
        </header>
        <div className="min-h-0 overflow-auto px-6 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
