"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Point } from "@/features/demo/types";
import { distance } from "@/features/demo/geometry";
import { svgPoint } from "../components/DemoDrawing";
import {
  snapMeasurementPoint,
  type MeasurementMode,
} from "./measurementGeometry";
import {
  useMeasurementStore,
  type DrawingMeasurement,
  type MeasurementKind,
} from "./measurementStore";

const pointsOf = (value: DrawingMeasurement) =>
  value.points?.length ? value.points : [value.start, value.end];

export function useMeasurementTool({
  viewportId,
  scale,
  active,
  deleteEnabled = active,
  mode = "any",
  kind = "distance",
}: {
  viewportId: string;
  scale: number;
  active: boolean;
  deleteEnabled?: boolean;
  mode?: MeasurementMode;
  kind?: MeasurementKind;
}) {
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [previewEnd, setPreviewEnd] = useState<Point | null>(null);
  const altPressed = useRef(false);
  const all = useMeasurementStore((state) => state.measurements);
  const selectedId = useMeasurementStore((state) => state.selectedId);
  const select = useMeasurementStore((state) => state.select);
  const add = useMeasurementStore((state) => state.add);
  const remove = useMeasurementStore((state) => state.remove);
  const measurements = useMemo(
    () => all.filter((value) => value.viewportId === viewportId),
    [all, viewportId],
  );
  const selected = measurements.find((value) => value.id === selectedId) || null;
  const current = selected || measurements.at(-1) || null;

  const clearDraft = () => {
    setDraftPoints([]);
    setPreviewEnd(null);
  };
  const finish = (points = draftPoints) => {
    const minimum = kind === "angle" || kind === "area" ? 3 : 2;
    if (points.length < minimum) return false;
    add({
      id: `MEASURE-${Date.now()}`,
      viewportId,
      kind,
      points,
      start: points[0],
      end: points.at(-1)!,
    });
    clearDraft();
    return true;
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Alt") altPressed.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt") altPressed.current = false;
    };
    const reset = () => {
      altPressed.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(clearDraft, [viewportId, kind]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input,textarea,select,[contenteditable='true']")) return;
      if (event.key === "Escape" && active && draftPoints.length) {
        event.preventDefault();
        clearDraft();
        return;
      }
      if (event.key === "Enter" && active && (kind === "area" || kind === "perimeter")) {
        event.preventDefault();
        finish();
        return;
      }
      if (
        deleteEnabled &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId
      ) {
        event.preventDefault();
        remove(selectedId);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function canvasClick(raw: Point) {
    if (!active) return;
    const anchor = draftPoints.at(-1);
    const point = anchor
      ? snapMeasurementPoint(anchor, raw, mode, altPressed.current)
      : raw;
    if (
      (kind === "area" || kind === "perimeter") &&
      draftPoints.length >= 3 &&
      distance(point, draftPoints[0]) < 14
    ) {
      finish();
      return;
    }
    const next = [...draftPoints, point];
    if ((kind === "distance" || kind === "radius") && next.length === 2) finish(next);
    else if (kind === "angle" && next.length === 3) finish(next);
    else {
      setDraftPoints(next);
      setPreviewEnd(point);
    }
  }
  function canvasMove(raw: Point) {
    const anchor = draftPoints.at(-1);
    if (active && anchor)
      setPreviewEnd(snapMeasurementPoint(anchor, raw, mode, altPressed.current));
  }
  const currentPoints = current ? pointsOf(current) : [];
  return {
    canvasClick,
    canvasMove,
    finishDraft: () => finish(),
    clearDraft,
    clearSelection: () => select(null),
    start: draftPoints[0] || null,
    previewEnd,
    previewPoints: draftPoints,
    kind,
    measurements,
    selected,
    current,
    selectedId,
    selectedLengthM:
      currentPoints.length > 1
        ? distance(currentPoints[0], currentPoints.at(-1)!) * scale
        : null,
    deleteSelected: () => selected && remove(selected.id),
    deleteCurrent: () => current && remove(current.id),
  };
}

export function MeasurementOverlay({
  measurements,
  selectedId,
  scale,
  editable,
  previewStart,
  previewEnd,
  previewPoints,
  previewKind = "distance",
  color = "#dc2626",
  onSelectMeasurement,
}: {
  measurements: DrawingMeasurement[];
  selectedId: string | null;
  scale: number;
  editable: boolean;
  previewStart?: Point | null;
  previewEnd?: Point | null;
  previewPoints?: Point[];
  previewKind?: MeasurementKind;
  color?: string;
  onSelectMeasurement?: () => void;
}) {
  const select = useMeasurementStore((state) => state.select);
  const draft = previewPoints?.length
    ? [...previewPoints, ...(previewEnd ? [previewEnd] : [])]
    : previewStart && previewEnd
      ? [previewStart, previewEnd]
      : [];
  return (
    <g>
      {measurements.map((value) => (
        <EditableMeasurement
          key={value.id}
          value={value}
          selected={selectedId === value.id}
          scale={scale}
          editable={editable}
          color={color}
          onSelect={() => {
            select(value.id);
            onSelectMeasurement?.();
          }}
        />
      ))}
      {draft.length > 1 ? (
        <MeasurementGraphic
          points={draft}
          kind={previewKind}
          scale={scale}
          color={color}
          preview
        />
      ) : previewStart ? (
        <circle cx={previewStart.x} cy={previewStart.y} r={5} fill={color} pointerEvents="none" />
      ) : null}
    </g>
  );
}

function EditableMeasurement({
  value,
  selected,
  scale,
  editable,
  color,
  onSelect,
}: {
  value: DrawingMeasurement;
  selected: boolean;
  scale: number;
  editable: boolean;
  color: string;
  onSelect: () => void;
}) {
  const update = useMeasurementStore((state) => state.update);
  const points = pointsOf(value);
  const kind = value.kind || "distance";
  const [drag, setDrag] = useState<null | {
    type: "shape" | "vertex";
    index?: number;
    pointerId: number;
    origin: Point;
    base: Point[];
    points: Point[];
  }>(null);
  const shown = drag?.points || points;
  function save(next: Point[]) {
    update(value.id, { points: next, start: next[0], end: next.at(-1)! });
  }
  function begin(type: "shape" | "vertex", event: ReactPointerEvent<SVGElement>, index?: number) {
    if (!editable || event.button !== 0) return;
    const point = svgPoint(event as never);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
    setDrag({
      type,
      index,
      pointerId: event.pointerId,
      origin: point,
      base: points.map((value) => ({ ...value })),
      points: points.map((value) => ({ ...value })),
    });
  }
  function move(event: ReactPointerEvent<SVGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(event as never);
    if (!point) return;
    const next = drag.type === "shape"
      ? drag.base.map((value) => ({
          x: value.x + point.x - drag.origin.x,
          y: value.y + point.y - drag.origin.y,
        }))
      : drag.points.map((value, index) => index === drag.index ? point : value);
    setDrag({ ...drag, points: next });
    save(next);
  }
  const stop = (event: ReactPointerEvent<SVGElement>) => {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  };
  return (
    <g onClick={(event) => { event.stopPropagation(); if (editable) onSelect(); }}>
      <MeasurementGraphic
        points={shown}
        kind={kind}
        scale={scale}
        color={color}
        selected={selected}
        onDown={(event) => begin("shape", event)}
        onMove={move}
        onStop={stop}
      />
      {selected && editable
        ? shown.map((point, index) => (
            <Handle
              key={index}
              point={point}
              color={color}
              onDown={(event) => begin("vertex", event, index)}
              onMove={move}
              onStop={stop}
            />
          ))
        : null}
    </g>
  );
}

function MeasurementGraphic({
  points,
  kind,
  scale,
  color,
  selected = false,
  preview = false,
  onDown,
  onMove,
  onStop,
}: {
  points: Point[];
  kind: MeasurementKind;
  scale: number;
  color: string;
  selected?: boolean;
  preview?: boolean;
  onDown?: (event: ReactPointerEvent<SVGElement>) => void;
  onMove?: (event: ReactPointerEvent<SVGElement>) => void;
  onStop?: (event: ReactPointerEvent<SVGElement>) => void;
}) {
  if (points.length < 2) return null;
  const closed = kind === "area" || kind === "perimeter";
  const attr = points.map((point) => `${point.x},${point.y}`).join(" ");
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const label = formatMeasurement(kind, points, scale);
  const labelWidth = Math.max(88, label.length * 8 + 20);
  const common = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onStop, onPointerCancel: onStop };
  return (
    <g opacity={preview ? 0.75 : 1}>
      {closed ? <>
        <polygon points={attr} fill={kind === "area" ? color : "transparent"} fillOpacity={kind === "area" ? 0.12 : 0} stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke" className={onDown ? "cursor-move" : undefined} {...common} />
        <polygon points={attr} fill={kind === "area" ? color : "transparent"} fillOpacity={kind === "area" ? 0.12 : 0} stroke={color} strokeWidth={selected ? 4 : 3} strokeDasharray={preview ? "7 5" : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </> : <>
        <polyline points={attr} fill="none" stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke" className={onDown ? "cursor-move" : undefined} {...common} />
        <polyline points={attr} fill="none" stroke={color} strokeWidth={selected ? 4 : 3} strokeDasharray={preview ? "7 5" : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      </>}
      {kind === "radius" ? <circle cx={points[0].x} cy={points[0].y} r={distance(points[0], points[1])} fill="none" stroke={color} strokeWidth={2} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
      <rect x={center.x - labelWidth / 2} y={center.y - 36} width={labelWidth} height={27} rx={8} fill="white" stroke={color} strokeWidth={selected ? 2 : 1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <text x={center.x} y={center.y - 18} textAnchor="middle" fontSize={14} fontWeight={800} fill={color} paintOrder="stroke" stroke="white" strokeWidth={3} pointerEvents="none">{label}</text>
    </g>
  );
}

function Handle({ point, color, onDown, onMove, onStop }: { point: Point; color: string; onDown: (event: ReactPointerEvent<SVGRectElement>) => void; onMove: (event: ReactPointerEvent<SVGRectElement>) => void; onStop: (event: ReactPointerEvent<SVGRectElement>) => void }) {
  return <rect x={point.x - 5} y={point.y - 5} width={10} height={10} rx={1} fill="white" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" className="cursor-crosshair" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onStop} onPointerCancel={onStop} />;
}

function formatMeasurement(kind: MeasurementKind, points: Point[], scale: number) {
  const segmentTotal = points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
  if (kind === "radius") return `R ${(distance(points[0], points[1]) * scale).toFixed(2)} m`;
  if (kind === "angle" && points.length >= 3) {
    const a = Math.atan2(points[0].y - points[1].y, points[0].x - points[1].x);
    const b = Math.atan2(points[2].y - points[1].y, points[2].x - points[1].x);
    let degrees = Math.abs((b - a) * 180 / Math.PI);
    if (degrees > 180) degrees = 360 - degrees;
    return `${degrees.toFixed(1)}°`;
  }
  const closing = points.length > 2 ? distance(points.at(-1)!, points[0]) : 0;
  if (kind === "perimeter") return `${((segmentTotal + closing) * scale).toFixed(2)} m perimeter`;
  if (kind === "area") {
    const twiceArea = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    return `${(Math.abs(twiceArea) / 2 * scale * scale).toFixed(2)} m²`;
  }
  return `${(distance(points[0], points[1]) * scale).toFixed(2)} m`;
}
