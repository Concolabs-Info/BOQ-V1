"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Slide = {
  title: string;
  description: string;
  preview: ReactNode;
};

const AUTO_ADVANCE_MS = 4500;

/**
 * Auto-advancing, dot-navigable carousel of small illustrative mockups —
 * built from our own tokens/components (abstract, not real screenshots),
 * used on the post-signup capabilities screen to show what the product
 * actually does rather than just describing it in a bullet list.
 */
export function FeaturePreviewCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const active = slides[index];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex h-60 w-full items-center justify-center overflow-hidden rounded-2xl bg-muted/40 p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10, rotate: -2, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, rotate: 2, scale: 0.96 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {active.preview}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-1.5 text-center"
        >
          <p className="text-base font-semibold text-foreground">{active.title}</p>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{active.description}</p>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-1">
        {slides.map((slide, dotIndex) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Show "${slide.title}"`}
            onClick={() => setIndex(dotIndex)}
            className="p-1"
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${
                dotIndex === index ? "w-6 bg-foreground" : "w-3 bg-gray-300"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
