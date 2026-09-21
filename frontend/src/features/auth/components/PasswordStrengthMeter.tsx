"use client";

import { AnimatePresence, motion } from "framer-motion";
import { passwordStrength } from "../password";

// Hex, not Tailwind classes — framer-motion animates `backgroundColor` by
// interpolating the color value itself, which only works with real colors.
const STRENGTH_COLOR: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#16a34a",
};

/**
 * Sits inline next to the "Set a password" label, right-aligned — a single
 * bar that fills as the password gets stronger, no word label.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);

  return (
    <AnimatePresence>
      {password ? (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "5rem" }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="h-1.5 shrink-0 overflow-hidden rounded-full bg-muted"
        >
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{
              width: `${(strength / 4) * 100}%`,
              backgroundColor: STRENGTH_COLOR[strength] ?? "#94a3b8",
            }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
