import type { ReactNode } from "react";

export function WorkspacePanel({ children, className = "", office = false }: { children?: ReactNode; className?: string; office?: boolean }) {
  return (
    <section className={`${office ? "min-h-full overflow-hidden rounded-lg border border-slate-300 bg-white" : "min-h-[520px] rounded-[24px] border border-slate-200 bg-white shadow-sm"} ${className}`}>
      {children}
    </section>
  );
}
