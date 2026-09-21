"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

const DISPLAY_MS = 2000;
const OUTRO_MS = 450;

/**
 * The last screen of onboarding — a brief, deliberately non-interactive
 * beat rather than another button to click. Holds for a moment on a quiet
 * success confirmation, then eases itself out before handing off to
 * `onContinue` (the actual navigation), so the transition feels designed
 * rather than an abrupt cut.
 */
export function OnboardingWelcome({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("onboarding.welcome");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setLeaving(true), DISPLAY_MS);
    return () => window.clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const outroTimer = window.setTimeout(onContinue, OUTRO_MS);
    return () => window.clearTimeout(outroTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <AnimatePresence>
      {!leaving ? (
        <motion.div
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={{ duration: OUTRO_MS / 1000, ease: "easeIn" }}
          className="flex flex-col items-center gap-5"
        >
          <div className="relative flex size-20 items-center justify-center">
            <motion.span
              initial={{ opacity: 0.5, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border border-primary/40"
            />
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Check className="size-9" aria-hidden="true" strokeWidth={2.5} />
            </motion.div>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="text-lg font-medium leading-7 text-foreground"
          >
            {t("body")}
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
