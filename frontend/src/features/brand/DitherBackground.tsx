"use client";

import { useEffect, useRef } from "react";

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function DitherBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let img: ImageData | null = null;

    const measure = () => {
      const scale = 0.42;
      w = Math.max(1, Math.round((canvas.clientWidth || 340) * scale));
      h = Math.max(1, Math.round((canvas.clientHeight || 640) * scale));
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
    };

    const paint = (t: number) => {
      if (!img) return;
      const data = img.data;
      const cx = w * 0.32;
      const cy = h * 0.34;
      const maxD = Math.hypot(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const falloff = 1 - (Math.hypot(x - cx, y - cy) / maxD) * 1.65;
          const n =
            noise(x * 0.055 + t, y * 0.055 - t * 0.6) * 0.62 +
            noise(x * 0.12 - t * 0.7, y * 0.12 + t) * 0.28 +
            noise(x * 0.24, y * 0.24) * 0.1;
          let field = falloff * 0.82 + n * 0.42;
          field = field < 0 ? 0 : field > 1 ? 1 : field;

          const i = (y * w + x) * 4;
          if (field <= (BAYER[y & 3][x & 3] + 0.5) / 16) {
            data[i + 3] = 0;
            continue;
          }
          const warm = x / w;
          data[i] = 255 * (0.62 + 0.38 * warm);
          data[i + 1] = 255 * (0.66 + 0.22 * warm);
          data[i + 2] = 255 * (1.0 - 0.4 * warm);
          data[i + 3] = 255 * field * field * 0.22;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
      paint(clock);
    });
    ro.observe(canvas);

    let clock = 0;
    let raf = 0;
    let lastFrame = 0;
    const loop = (now: number) => {
      if (!document.hidden && now - lastFrame > 110) {
        lastFrame = now;
        clock += 0.007;
        paint(clock);
      }
      raf = requestAnimationFrame(loop);
    };

    paint(0);
    if (!still) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
