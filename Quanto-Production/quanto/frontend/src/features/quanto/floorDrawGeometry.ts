import type { Point } from "@/features/demo/types";

const EPSILON = 1e-6;

export function signedPolygonArea(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

export function lineSide(point: Point, start: Point, end: Point) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function samePoint(a: Point, b: Point, tolerance = 0.75) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function intersectionWithLine(a: Point, b: Point, lineStart: Point, lineEnd: Point): Point {
  const sideA = lineSide(a, lineStart, lineEnd), sideB = lineSide(b, lineStart, lineEnd);
  const denominator = sideA - sideB;
  if (Math.abs(denominator) < EPSILON) return { ...a };
  const ratio = sideA / denominator;
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}

function clipHalfPlane(points: Point[], lineStart: Point, lineEnd: Point, keepPositive: boolean) {
  const output: Point[] = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length];
    const currentInside = keepPositive ? lineSide(current, lineStart, lineEnd) >= -EPSILON : lineSide(current, lineStart, lineEnd) <= EPSILON;
    const nextInside = keepPositive ? lineSide(next, lineStart, lineEnd) >= -EPSILON : lineSide(next, lineStart, lineEnd) <= EPSILON;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) output.push(intersectionWithLine(current, next, lineStart, lineEnd));
  }
  return removeDuplicatePoints(output);
}

export function splitPolygonByLine(points: Point[], lineStart: Point, lineEnd: Point): [Point[], Point[]] | null {
  if (Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y) < EPSILON) return null;
  const positive = clipHalfPlane(points, lineStart, lineEnd, true);
  const negative = clipHalfPlane(points, lineStart, lineEnd, false);
  if (positive.length < 3 || negative.length < 3 || Math.abs(signedPolygonArea(positive)) < 1 || Math.abs(signedPolygonArea(negative)) < 1 || !isSimplePolygon(positive) || !isSimplePolygon(negative)) return null;
  return [positive, negative];
}

function removeDuplicatePoints(points: Point[]) {
  const result = points.filter((point, index) => !index || !samePoint(point, points[index - 1]));
  if (result.length > 1 && samePoint(result[0], result.at(-1)!)) result.pop();
  return result;
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = lineSide(c, a, b), abD = lineSide(d, a, b), cdA = lineSide(a, c, d), cdB = lineSide(b, c, d);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

export function isSimplePolygon(points: Point[]) {
  if (points.length < 3 || Math.abs(signedPolygonArea(points)) < 1) return false;
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return false;
    }
  }
  return true;
}

type DirectedEdge = { start: Point; end: Point };

function pointOnSegment(point: Point, start: Point, end: Point) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < EPSILON || Math.abs(lineSide(point, start, end)) / length > 0.75) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  return dot > EPSILON && dot < length * length - EPSILON;
}

/** Joins polygons which share one or more full or partial boundary edges. */
export function mergePolygonsAlongSharedEdges(first: Point[], second: Point[]) {
  const edges: DirectedEdge[] = [];
  const allVertices = [...first, ...second];
  const addEdges = (points: Point[]) => points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x, dy = end.y - start.y;
    const intermediate = allVertices
      .filter((point) => pointOnSegment(point, start, end))
      .sort((a, b) => ((a.x - start.x) * dx + (a.y - start.y) * dy) - ((b.x - start.x) * dx + (b.y - start.y) * dy));
    const split = [start, ...intermediate, end];
    for (let part = 0; part < split.length - 1; part++) edges.push({ start: split[part], end: split[part + 1] });
  });
  addEdges(first);
  addEdges(second);
  const shared = new Set<number>();
  for (let a = 0; a < edges.length; a++) {
    for (let b = a + 1; b < edges.length; b++) {
      if (samePoint(edges[a].start, edges[b].end) && samePoint(edges[a].end, edges[b].start)) {
        shared.add(a); shared.add(b);
      }
    }
  }
  if (!shared.size) return null;
  const boundary = edges.filter((_, index) => !shared.has(index));
  const merged: Point[] = [{ ...boundary[0].start }];
  let current = boundary[0].end;
  boundary.splice(0, 1);
  while (boundary.length) {
    merged.push({ ...current });
    const nextIndex = boundary.findIndex((edge) => samePoint(edge.start, current));
    if (nextIndex < 0) return null;
    current = boundary[nextIndex].end;
    boundary.splice(nextIndex, 1);
  }
  if (!samePoint(current, merged[0])) return null;
  const cleaned = removeDuplicatePoints(merged);
  return isSimplePolygon(cleaned) ? cleaned : null;
}

function infiniteLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const adx = a2.x - a1.x, ady = a2.y - a1.y, bdx = b2.x - b1.x, bdy = b2.y - b1.y;
  const denominator = adx * bdy - ady * bdx;
  if (Math.abs(denominator) < EPSILON) return null;
  const t = ((b1.x - a1.x) * bdy - (b1.y - a1.y) * bdx) / denominator;
  return { x: a1.x + t * adx, y: a1.y + t * ady };
}

export function offsetPolygon(points: Point[], distance: number) {
  if (points.length < 3 || !Number.isFinite(distance) || Math.abs(distance) < EPSILON) return null;
  const orientation = Math.sign(signedPolygonArea(points)) || 1;
  const shifted = points.map((start, index) => {
    const end = points[(index + 1) % points.length], dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    if (length < EPSILON) return null;
    const normal = orientation > 0 ? { x: dy / length, y: -dx / length } : { x: -dy / length, y: dx / length };
    return { start: { x: start.x + normal.x * distance, y: start.y + normal.y * distance }, end: { x: end.x + normal.x * distance, y: end.y + normal.y * distance } };
  });
  if (shifted.some((edge) => !edge)) return null;
  const result = shifted.map((edge, index) => {
    const previous = shifted[(index - 1 + shifted.length) % shifted.length]!;
    return infiniteLineIntersection(previous.start, previous.end, edge!.start, edge!.end) || edge!.start;
  });
  return isSimplePolygon(result) ? result : null;
}

export function offsetPolyline(points: Point[], distance: number) {
  if (points.length < 2) return null;
  const first = points[0], second = points[1], dx = second.x - first.x, dy = second.y - first.y, length = Math.hypot(dx, dy);
  if (length < EPSILON) return null;
  const shift = { x: -dy / length * distance, y: dx / length * distance };
  return points.map((point) => ({ x: point.x + shift.x, y: point.y + shift.y }));
}
