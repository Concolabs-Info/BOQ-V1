"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Slide = {
  title: string;
  description: string;
  preview: ReactNode;
};

const AUTO_ADVANCE_MS = 4500;

const SIZE_SPRING = { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.85 };

function useMeasuredHeight(key: string | number) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const next = node.getBoundingClientRect().height;
      if (next > 0) setHeight(next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [key]);

  return { ref, height };
}

/**
 * Auto-advancing, dot-navigable carousel of small illustrative mockups —
 * built from our own tokens/components (abstract, not real screenshots),
 * used on the post-signup capabilities screen to show what the product
 * actually does rather than just describing it in a bullet list.
 *
 * Preview and caption heights follow the active slide; the card around them
 * eases to the new size instead of snapping when mockups differ.
 */
export function FeaturePreviewCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const active = slides[index];
  const preview = useMeasuredHeight(index);
  const caption = useMeasuredHeight(`caption-${index}`);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [index, slides.length]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3 roomy:gap-4">
      <motion.div
        initial={false}
        animate={preview.height == null ? undefined : { height: preview.height }}
        transition={SIZE_SPRING}
        className="relative w-full min-w-0 overflow-hidden rounded-xl bg-muted/40 roomy:rounded-2xl"
      >
        <div ref={preview.ref} className="flex w-full justify-center p-2 roomy:p-5" aria-hidden="true">
          <div className="invisible w-full min-w-0 max-w-[17.5rem] roomy:max-w-80">{active.preview}</div>
        </div>
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10, rotate: -2, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, rotate: 2, scale: 0.96 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center p-2 roomy:p-5"
          >
            <div className="w-full min-w-0 max-w-[17.5rem] roomy:max-w-80">{active.preview}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={false}
        animate={caption.height == null ? undefined : { height: caption.height }}
        transition={SIZE_SPRING}
        className="relative w-full min-w-0 overflow-hidden"
      >
        <div ref={caption.ref} className="px-1" aria-hidden="true">
          <div className="invisible flex flex-col items-center gap-1 text-center roomy:gap-1.5">
            <p className="text-pretty text-sm font-semibold roomy:text-base">{active.title}</p>
            <p className="max-w-md text-pretty text-xs leading-5 roomy:text-sm roomy:leading-6">{active.description}</p>
          </div>
        </div>
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 px-1 text-center roomy:gap-1.5"
          >
            <p className="text-pretty text-sm font-semibold text-foreground roomy:text-base">{active.title}</p>
            <p className="max-w-md text-pretty text-xs leading-5 text-muted-foreground roomy:text-sm roomy:leading-6">
              {active.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>

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
