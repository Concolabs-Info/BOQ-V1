"use client";

import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DrawingCanvas,
  type DrawingCanvasTool,
} from "@/features/drawing/components/DrawingCanvas";
import { usePreStore } from "@/features/pre/state/preStore";
import type { Point } from "@/features/demo/types";

export const DRAWING_WIDTH = 1737;
export const DRAWING_HEIGHT = 2456;

export function drawingSize(sheet?: { page: number; renderWidth?: number; renderHeight?: number }) {
  if (sheet?.renderWidth && sheet?.renderHeight) return { width: sheet.renderWidth, height: sheet.renderHeight };
  if (sheet && sheet.page <= 12) return { width: 935, height: 1210 };
  return sheet && sheet.page >= 23 ? { width: 2573, height: 1820 } : { width: 1820, height: 2573 };
}

export function svgPoint(event: {
  clientX: number;
  clientY: number;
  currentTarget: SVGElement;
}): Point | null {
  const svg = event.currentTarget.ownerSVGElement;
  const matrix = svg?.getScreenCTM();

  if (!svg || !matrix) return null;

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const transformedPoint = point.matrixTransform(matrix.inverse());

  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  };
}

export function PreDrawing({
  viewportId,
  tool = "select",
  onCanvasClick,
  onCanvasMove,
  onCanvasDragStart,
  onCanvasDragMove,
  onCanvasDragEnd,
  children,
  showFocus = true,
  toolbar,
  toolbarRight,
  showMinimap = false,
  showDrawing = true,
  focusBox,
  focusRequest,
}: {
  viewportId: string;
  tool?: DrawingCanvasTool;
  onCanvasClick?: (point: Point, canvasScale: number) => void;
  onCanvasMove?: (point: Point, canvasScale: number) => void;
  onCanvasDragStart?: (point: Point, canvasScale: number) => void;
  onCanvasDragMove?: (point: Point, canvasScale: number) => void;
  onCanvasDragEnd?: (point: Point, canvasScale: number) => void;
  children?: ReactNode;
  showFocus?: boolean;
  toolbar?: ReactNode;
  toolbarRight?: ReactNode;
  showMinimap?: boolean;
  showDrawing?: boolean;
  focusBox?: [number, number, number, number];
  focusRequest?: number;
}) {
  const store = usePreStore();
  const viewport = store.viewports.find((item) => item.id === viewportId);
  const sheet = store.sheets.find(
    (item) => item.id === viewport?.sheetId,
  );
  const box = viewport?.bbox;
  const size = drawingSize(sheet);

  const [view, setView] = useState<{ zoom: number; pan: Point }>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });

  function jumpFromMinimap(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX =
      (event.clientX - rect.left) / Math.max(1, rect.width);
    const normalizedY =
      (event.clientY - rect.top) / Math.max(1, rect.height);

    setView({
      zoom: 2.1,
      pan: {
        x: (0.5 - normalizedX) * 520,
        y: (0.5 - normalizedY) * 520,
      },
    });
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <DrawingCanvas
        imageUrl={sheet?.image || null}
        width={size.width}
        height={size.height}
        tool={tool}
        onCanvasClick={onCanvasClick}
        onCanvasMove={onCanvasMove}
        onCanvasDragStart={onCanvasDragStart}
        onCanvasDragMove={onCanvasDragMove}
        onCanvasDragEnd={onCanvasDragEnd}
        initialView={view}
        className="h-full min-h-0"
        toolbarLeft={toolbar}
        toolbarRight={toolbarRight}
        focusBox={focusBox}
        focusRequest={focusRequest}
      >
        {!showDrawing ? (
          <rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill="white"
            opacity=".86"
            pointerEvents="none"
          />
        ) : null}

        {showFocus && box && showDrawing ? (
          <FocusMask
            box={box}
            width={size.width}
            height={size.height}
          />
        ) : null}

        {children}
      </DrawingCanvas>

      {showMinimap && sheet?.image ? (
        <div
          onPointerDown={jumpFromMinimap}
          className="absolute bottom-12 right-4 z-40 h-36 w-24 cursor-crosshair overflow-hidden rounded-lg border-2 border-white bg-white shadow-xl"
          title="Click the minimap to jump around this sheet"
        >
          <img
            src={sheet.image}
            alt="Page minimap"
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-0 bg-slate-950/5" />

          {box ? (
            <div
              className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10"
              style={{
                left: `${(box[0] / size.width) * 100}%`,
                top: `${(box[1] / size.height) * 100}%`,
                width: `${((box[2] - box[0]) / size.width) * 100}%`,
                height: `${((box[3] - box[1]) / size.height) * 100}%`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FocusMask({
  box,
  width,
  height,
}: {
  box: [number, number, number, number];
  width: number;
  height: number;
}) {
  const [x0, y0, x1, y1] = box;

  return (
    <g pointerEvents="none">
      <rect
        x="0"
        y="0"
        width={width}
        height={y0}
        fill="white"
        opacity=".62"
      />

      <rect
        x="0"
        y={y1}
        width={width}
        height={height - y1}
        fill="white"
        opacity=".62"
      />

      <rect
        x="0"
        y={y0}
        width={x0}
        height={y1 - y0}
        fill="white"
        opacity=".62"
      />

      <rect
        x={x1}
        y={y0}
        width={width - x1}
        height={y1 - y0}
        fill="white"
        opacity=".62"
      />

      <rect
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        fill="none"
        stroke="#2563eb"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export function ViewportEditorOverlay({
  viewportId,
}: {
  viewportId: string;
}) {
  const viewport = usePreStore((state) =>
    state.viewports.find((item) => item.id === viewportId),
  );
  const sheet = usePreStore((state) =>
    state.sheets.find((item) => item.id === viewport?.sheetId),
  );
  const updateViewport = usePreStore(
    (state) => state.updateViewport,
  );

  const [drag, setDrag] = useState<null | {
    type: "move" | "nw" | "ne" | "sw" | "se";
    start: Point;
    box: [number, number, number, number];
  }>(null);

  if (!viewport) return null;

  const size = drawingSize(sheet);
  const box = viewport.bbox;

  function startDrag(
    type: NonNullable<typeof drag>["type"],
    event: ReactPointerEvent<SVGElement>,
  ) {
    const point = svgPoint(event as any);

    if (!point) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    setDrag({
      type,
      start: point,
      box: [...box],
    });
  }

  function move(event: ReactPointerEvent<SVGElement>) {
    if (!drag) return;

    const point = svgPoint(event as any);

    if (!point) return;

    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;

    let [x0, y0, x1, y1] = drag.box;

    if (drag.type === "move") {
      x0 += deltaX;
      x1 += deltaX;
      y0 += deltaY;
      y1 += deltaY;
    } else {
      if (drag.type.includes("w")) x0 += deltaX;
      if (drag.type.includes("e")) x1 += deltaX;
      if (drag.type.includes("n")) y0 += deltaY;
      if (drag.type.includes("s")) y1 += deltaY;
    }

    updateViewport(viewportId, {
      bbox: [
        Math.max(0, x0),
        Math.max(0, y0),
        Math.min(size.width, x1),
        Math.min(size.height, y1),
      ],
    });
  }

  const handles: [
    [number, number, string],
    [number, number, string],
    [number, number, string],
    [number, number, string],
  ] = [
    [box[0], box[1], "nw"],
    [box[2], box[1], "ne"],
    [box[0], box[3], "sw"],
    [box[2], box[3], "se"],
  ];

  return (
    <g>
      <rect
        x={box[0]}
        y={box[1]}
        width={box[2] - box[0]}
        height={box[3] - box[1]}
        fill="transparent"
        stroke="#2563eb"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        className="cursor-move"
        onPointerDown={(event) => startDrag("move", event)}
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      />

      {handles.map(([x, y, handle]) => (
        <rect
          key={handle}
          x={x - 8}
          y={y - 8}
          width={16}
          height={16}
          fill="white"
          stroke="#2563eb"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          className="cursor-crosshair"
          onPointerDown={(event) =>
            startDrag(
              handle as "nw" | "ne" | "sw" | "se",
              event,
            )
          }
          onPointerMove={move}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        />
      ))}
    </g>
  );
}
