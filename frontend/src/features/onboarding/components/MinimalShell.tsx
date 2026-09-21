"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { BrandLockup } from "@/features/brand/BrandLockup";
import { LanguageSwitcher } from "./LanguageSwitcher";

function BackChevron() {
  return (
    <svg
      viewBox="8 5 8 14"
      fill="none"
      aria-hidden="true"
      className="h-[1cap] w-auto shrink-0 overflow-visible"
    >
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WIDTH_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
} as const;

export type ShellWidth = keyof typeof WIDTH_CLASS;

/**
 * Shared auth/onboarding shell: logo pinned top-left, optional Back top-right,
 * a bottom bar with copyright (left) and the language switcher (right), and
 * the card centered independently in the remaining space.
 *
 * The card's width is content-driven (`width` prop) and resizes with a
 * smooth spring via `layout` rather than snapping. `stepKey` identifies
 * which screen is showing so its content can slide/fade in on change
 * instead of just replacing instantly — pass the actual step name where
 * one exists; it falls back to `heading`, which is usually distinct enough.
 */
export function MinimalShell({
  heading,
  sub,
  footer,
  children,
  width = "md",
  stepKey,
  card = true,
  onBack,
  dense = false,
}: {
  heading: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
  width?: ShellWidth;
  stepKey?: string;
  /** Set false for a brief, non-task screen (e.g. the final welcome beat) that shouldn't look like a form card. */
  card?: boolean;
  onBack?: () => void;
  /** Tighter type and spacing so a preview-heavy step still fits a short phone. */
  dense?: boolean;
}) {
  const t = useTranslations("shell");

  return (
    <div
      data-fit-viewport
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6 [&_input]:text-base [&_textarea]:text-base sm:[&_input]:text-sm sm:[&_textarea]:text-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 sm:gap-3">
        <BrandLockup />
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-2.5"
          >
            <span className="inline-flex items-baseline gap-1.5 text-sm font-medium leading-none">
              <BackChevron />
              {t("back")}
            </span>
          </button>
        ) : null}
      </div>
      <div
        className={`min-h-0 flex-1 overscroll-y-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
          dense ? "overflow-y-auto roomy:overflow-hidden" : "overflow-y-auto"
        }`}
      >
        <div className="mx-auto flex min-h-full w-full min-w-0 flex-col items-center justify-center gap-3 py-2 roomy:py-0">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.85 }}
            className={`flex w-full min-w-0 ${WIDTH_CLASS[width]} flex-col overflow-x-clip ${
              card ? "rounded-2xl border border-border bg-card p-4 shadow-sm roomy:p-6" : "p-2 roomy:p-4"
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stepKey ?? heading}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`flex min-w-0 flex-col ${card ? "" : "items-center"} ${dense ? "gap-3 roomy:gap-4" : card ? "gap-4" : "gap-6"}`}
              >
                <div className="flex flex-col items-center gap-1 text-center roomy:gap-1.5">
                  <h1 className={`max-w-full text-balance break-words font-bold tracking-tight text-foreground ${dense ? "text-lg roomy:text-2xl" : "text-xl roomy:text-2xl"}`}>
                    {heading}
                  </h1>
                  {sub ? (
                    <p className={`text-pretty text-muted-foreground ${dense ? "hidden text-sm leading-6 roomy:block" : "text-xs leading-5 roomy:text-sm roomy:leading-6"}`}>
                      {sub}
                    </p>
                  ) : null}
                </div>
                {children}
              </motion.div>
            </AnimatePresence>
          </motion.div>
          {footer ? (
            <div className="w-full min-w-0 max-w-lg shrink-0 px-1 text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{t("copyright", { year: new Date().getFullYear() })}</span>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
