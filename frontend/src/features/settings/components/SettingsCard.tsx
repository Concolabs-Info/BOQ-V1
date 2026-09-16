import type { ReactNode } from "react";

export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>;
}

export function SettingsCard({
  title,
  description,
  action,
  children,
  footerHint,
  footer,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  footerHint?: string;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 px-6 pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children ? <div className="px-6 pb-6 pt-4">{children}</div> : <div className="pb-6" />}
      {footer || footerHint ? (
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          {footerHint ? <p className="text-xs leading-5 text-slate-500">{footerHint}</p> : <span />}
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
