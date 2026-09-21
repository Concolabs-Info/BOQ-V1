"use client";

import { useState, type SVGProps } from "react";
import { FieldLabel } from "@/features/onboarding/components/formBits";

export function TypeToConfirmLabel({
  htmlFor,
  value,
  required = false,
}: {
  htmlFor: string;
  value: string;
  required?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <FieldLabel htmlFor={htmlFor} required={required}>
      <span className="min-w-0 font-normal text-slate-600">
        Type{" "}
        <span className="inline-flex max-w-full items-center gap-1 align-middle">
          <span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-950">{value}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label={copied ? "Copied" : `Copy ${value}`}
          >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </button>
        </span>{" "}
        to confirm
      </span>
    </FieldLabel>
  );
}

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden {...props}>
      <path d="M5 12.5 9.5 17 19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
