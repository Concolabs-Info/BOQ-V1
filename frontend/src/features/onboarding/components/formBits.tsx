import type { ReactNode } from "react";

export function QuantoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="#2563eb" />
      <path d="M12 13h16v4H17v4h9v4h-9v4h11" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600">{message}</p>;
}

export function FieldLabel({ htmlFor, children, required = false }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-slate-950">
      {children}
      {required ? <span className="text-red-600">*</span> : null}
    </label>
  );
}
