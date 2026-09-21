"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { BrandLockup } from "@/features/brand/BrandLockup";
import { LanguageSwitcher } from "./LanguageSwitcher";

const WIDTH_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
} as const;

export type ShellWidth = keyof typeof WIDTH_CLASS;

/**
 * Shared auth/onboarding shell: logo pinned top-left, a bottom bar with
 * copyright (left) and the language switcher (right), and the card
 * centered independently in the remaining space.
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
}: {
  heading: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
  width?: ShellWidth;
  stepKey?: string;
  /** Set false for a brief, non-task screen (e.g. the final welcome beat) that shouldn't look like a form card. */
  card?: boolean;
}) {
  const t = useTranslations("shell");

  return (
    <div className="flex min-h-dvh flex-col bg-background p-4 md:p-6">
      <BrandLockup />
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <motion.div
          layout
          transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
          className={`flex w-full ${WIDTH_CLASS[width]} flex-col overflow-hidden ${
            card ? "rounded-2xl border border-border bg-card p-8 shadow-sm" : "p-4"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stepKey ?? heading}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading}</h1>
                {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
              </div>
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.div>
        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("copyright", { year: new Date().getFullYear() })}</span>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
