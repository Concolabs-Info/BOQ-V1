"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { cn } from "@/shared/lib/cn";

const LENGTH = 6;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, LENGTH);
}

export function CodeField({
  id,
  label = "Verification code",
  value,
  onChange,
  onComplete,
  error,
  autoFocus = false,
  disabled = false,
  required = false,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const chars = digitsOnly(value);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const finished = useRef(false);

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  function emit(next: string, focusAt?: number) {
    const cleaned = digitsOnly(next);
    onChange(cleaned);
    if (typeof focusAt === "number") {
      inputs.current[Math.max(0, Math.min(focusAt, LENGTH - 1))]?.focus();
    }
    if (cleaned.length === LENGTH) {
      if (!finished.current) {
        finished.current = true;
        onComplete?.(cleaned);
      }
    } else {
      finished.current = false;
    }
  }

  function onCellChange(index: number, raw: string) {
    const incoming = digitsOnly(raw);
    if (incoming.length > 1) {
      emit(chars.slice(0, index) + incoming, Math.min(index + incoming.length, LENGTH - 1));
      return;
    }
    if (!incoming) {
      emit(chars.slice(0, index) + chars.slice(index + 1), index);
      return;
    }
    emit(chars.slice(0, index) + incoming + chars.slice(index + 1), index + 1);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (chars[index]) {
        emit(chars.slice(0, index) + chars.slice(index + 1), index);
      } else if (index > 0) {
        emit(chars.slice(0, index - 1) + chars.slice(index), index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const incoming = digitsOnly(event.clipboardData.getData("text"));
    if (!incoming) return;
    emit(chars.slice(0, index) + incoming, Math.min(index + incoming.length, LENGTH - 1));
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={`${id}-0`} required={required}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        {Array.from({ length: LENGTH }, (_, index) => (
          <span key={index} className="contents">
            {index === 3 ? <span className="w-1.5 shrink-0 text-center text-slate-300" aria-hidden>•</span> : null}
            <input
              ref={(node) => {
                inputs.current[index] = node;
              }}
              id={index === 0 ? `${id}-0` : undefined}
              name={index === 0 ? id : undefined}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${index + 1} of ${LENGTH}`}
              aria-invalid={Boolean(error)}
              required={required && index === 0}
              disabled={disabled}
              maxLength={index === 0 ? LENGTH : 1}
              value={chars[index] ?? ""}
              onChange={(event) => onCellChange(index, event.target.value)}
              onKeyDown={(event) => onKeyDown(index, event)}
              onPaste={(event) => onPaste(index, event)}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                "h-12 min-w-0 flex-1 rounded-xl border bg-white text-center text-lg font-medium text-slate-950 outline-none transition",
                error
                  ? "border-destructive focus:border-destructive focus:ring-3 focus:ring-destructive/20"
                  : "border-slate-200 focus:border-ring focus:ring-1 focus:ring-ring/15",
                disabled && "opacity-50",
              )}
            />
          </span>
        ))}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
