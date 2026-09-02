import type { Point } from "@/features/demo/types";

export type MeasurementMode = "horizontal" | "vertical" | "any";

export function snapMeasurementPoint(origin: Point, raw: Point, mode: MeasurementMode = "any", bypass = false, thresholdDegrees = 7): Point {
  if (bypass) return raw;
  if (mode === "horizontal") return { x: raw.x, y: origin.y };
  if (mode === "vertical") return { x: origin.x, y: raw.y };
  const dx = raw.x - origin.x, dy = raw.y - origin.y;
  if (!dx && !dy) return raw;
  const angle = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
  const horizontalError = Math.min(Math.abs(angle), Math.abs(angle - 180), Math.abs(angle - 360));
  const verticalError = Math.min(Math.abs(angle - 90), Math.abs(angle - 270));
  if (horizontalError <= thresholdDegrees) return { x: raw.x, y: origin.y };
  if (verticalError <= thresholdDegrees) return { x: origin.x, y: raw.y };
  return raw;
}
