"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Drop-in replacement for `{error ? <p role="alert">{error}</p> : null}` —
 * same markup and behavior, but the message eases in/out instead of
 * popping, so validation feedback doesn't feel like a jolt.
 */
export function FieldErrorText({ children }: { children: string | null | undefined }) {
  return (
    <AnimatePresence>
      {children ? (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0, y: -2 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -2 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="overflow-hidden text-sm text-destructive"
        >
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
