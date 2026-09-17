"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { cn } from "@/shared/lib/cn";

export const AUTH_CONTROL_CLASS =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-50 aria-[invalid=true]:border-red-400";

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="m3 3 18 18" /> : null}
    </svg>
  );
}

export function AuthField({
  id,
  label,
  error,
  hint,
  type,
  required,
  className,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
} & ComponentProps<"input">) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>
        {hint}
      </div>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(AUTH_CONTROL_CLASS, isPassword && "pr-11", className)}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setReveal((value) => !value)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-950"
          >
            <EyeIcon off={reveal} />
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
