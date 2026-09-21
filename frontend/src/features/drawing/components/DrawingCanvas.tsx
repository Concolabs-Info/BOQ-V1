"use client";

import {
  useCallback,
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Point } from "../types";
import {
  TAKEOFF_COMMAND_EVENT,
  TAKEOFF_VIEW_EVENT,
  dispatchTakeoffStatus,
  type TakeoffCommand,
  type TakeoffViewState,
} from "@/features/quanto/takeoffCommands";
import { useTakeoffGeometryAllowed } from "@/features/quanto/takeoffGeometryAccess";

export type DrawingCanvasTool = "select" | "pan" | "point" | "draw";
export type DrawingComparisonImage = { id: string; label: string; imageUrl: string };

type ViewState = {
  zoom: number;
  pan: Point;
};

type Props = {
  imageUrl: string | null;
  width: number;
  height: number;
  tool?: DrawingCanvasTool;
  children?: ReactNode;
  onCanvasClick?: (point: Point, canvasScale: number) => void;
  onCanvasMove?: (point: Point, canvasScale: number) => void;
  onCanvasDragStart?: (point: Point, canvasScale: number) => void;
  onCanvasDragMove?: (point: Point, canvasScale: number) => void;
  onCanvasDragEnd?: (point: Point, canvasScale: number) => void;
  onViewChange?: (view: ViewState) => void;
  initialView?: ViewState;
  className?: string;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  hideToolbar?: boolean;
  focusBox?: [number, number, number, number];
  focusRequest?: number;
  comparisonImages?: DrawingComparisonImage[];
};

type PanDrag = {
  pointerId: number;
  startClient: Point;
  startPan: Point;
  moved: boolean;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 40;
const VIEW_PADDING = 40;
const DrawingZoomContext = createContext(1);
export function useDrawingZoom() {
  return useContext(DrawingZoomContext);
}

export function DrawingCanvas({
  imageUrl,
  width,
  height,
  tool = "select",
  children,
  onCanvasClick,
  onCanvasMove,
  onCanvasDragStart,
  onCanvasDragMove,
  onCanvasDragEnd,
  onViewChange,
  initialView,
  className = "",
  toolbarLeft,
  toolbarRight,
  hideToolbar = false,
  focusBox,
  focusRequest,
  comparisonImages = [],
}: Props) {
  const geometryAllowed = useTakeoffGeometryAllowed();
  const activeTool = geometryAllowed || tool === "pan" || tool === "select" ? tool : "select";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<PanDrag | null>(null);
  const suppressClickRef = useRef(false);
  const drawPointerRef = useRef<{
    pointerId: number;
    startClient: Point;
    moved: boolean;
  } | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  const reportedViewRef = useRef<ViewState | null>(null);
  const zoomRef = useRef(initialView?.zoom ?? 1);
  const panRef = useRef<Point>(initialView?.pan ?? { x: 0, y: 0 });
  const sizeRef = useRef({ width: 900, height: 620 });
  const previousViewRef = useRef<ViewState | null>(null);

  const [zoom, setZoom] = useState(initialView?.zoom ?? 1);
  const [pan, setPan] = useState<Point>(initialView?.pan ?? { x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 900, height: 620 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageRotation, setPageRotation] = useState(0);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [drawingVisible, setDrawingVisible] = useState(true);
  const [takeoffVisible, setTakeoffVisible] = useState(true);
  const [comparisonVisible, setComparisonVisible] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"overlay" | "difference">("overlay");
  const [comparisonOpacity, setComparisonOpacity] = useState(0.5);
  const [comparisonId, setComparisonId] = useState("");
  const [comparisonOffset, setComparisonOffset] = useState<Point>({ x: 0, y: 0 });
  const [comparisonPanel, setComparisonPanel] = useState(false);

  const sourceWidth = Math.max(1, width);
  const sourceHeight = Math.max(1, height);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    sizeRef.current = viewportSize;
  }, [viewportSize]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    if (
      !Number.isFinite(zoom) ||
      !Number.isFinite(pan.x) ||
      !Number.isFinite(pan.y)
    )
      return;
    const previous = reportedViewRef.current;
    if (
      previous &&
      Math.abs(previous.zoom - zoom) < 0.0001 &&
      Math.abs(previous.pan.x - pan.x) < 0.0001 &&
      Math.abs(previous.pan.y - pan.y) < 0.0001
    )
      return;
    const next = { zoom, pan: { x: pan.x, y: pan.y } };
    reportedViewRef.current = next;
    onViewChangeRef.current?.(next);
  }, [pan.x, pan.y, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      };
      sizeRef.current = next;
      setViewportSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const nextZoom = initialView?.zoom ?? 1;
    const nextPan = initialView?.pan ?? { x: 0, y: 0 };
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom((current) =>
      Math.abs(current - nextZoom) < 0.0001 ? current : nextZoom,
    );
    setPan((current) =>
      current.x === nextPan.x && current.y === nextPan.y ? current : nextPan,
    );
  }, [
    height,
    imageUrl,
    initialView?.pan?.x,
    initialView?.pan?.y,
    initialView?.zoom,
    width,
  ]);

  const fitScale = useMemo(() => {
    const availableWidth = Math.max(1, viewportSize.width - VIEW_PADDING * 2);
    const availableHeight = Math.max(1, viewportSize.height - VIEW_PADDING * 2);
    return Math.max(
      0.0001,
      Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight),
    );
  }, [sourceHeight, sourceWidth, viewportSize.height, viewportSize.width]);

  const pageWidth = sourceWidth * fitScale * zoom;
  const pageHeight = sourceHeight * fitScale * zoom;
  const pageLeft = (viewportSize.width - pageWidth) / 2 + pan.x;
  const pageTop = (viewportSize.height - pageHeight) / 2 + pan.y;

  const updatePan = useCallback((next: Point) => {
    panRef.current = next;
    setPan(next);
  }, []);

  const updateZoom = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  const layoutFor = useCallback(
    (viewZoom: number, viewPan: Point) => {
      const viewport = sizeRef.current;
      const availableWidth = Math.max(1, viewport.width - VIEW_PADDING * 2);
      const availableHeight = Math.max(1, viewport.height - VIEW_PADDING * 2);
      const baseScale = Math.max(
        0.0001,
        Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight),
      );
      const renderedWidth = sourceWidth * baseScale * viewZoom;
      const renderedHeight = sourceHeight * baseScale * viewZoom;
      return {
        fitScale: baseScale,
        width: renderedWidth,
        height: renderedHeight,
        left: (viewport.width - renderedWidth) / 2 + viewPan.x,
        top: (viewport.height - renderedHeight) / 2 + viewPan.y,
      };
    },
    [sourceHeight, sourceWidth],
  );

  const zoomAtPoint = useCallback(
    (viewportX: number, viewportY: number, requestedZoom: number) => {
      const currentZoom = zoomRef.current;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
      if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

      const currentPan = panRef.current;
      const currentLayout = layoutFor(currentZoom, currentPan);
      const sourceX =
        (viewportX - currentLayout.left) / Math.max(1, currentLayout.width);
      const sourceY =
        (viewportY - currentLayout.top) / Math.max(1, currentLayout.height);
      const nextLayout = layoutFor(nextZoom, { x: 0, y: 0 });
      const nextPan = {
        x: viewportX - sourceX * nextLayout.width - nextLayout.left,
        y: viewportY - sourceY * nextLayout.height - nextLayout.top,
      };

      panRef.current = nextPan;
      zoomRef.current = nextZoom;
      setPan(nextPan);
      setZoom(nextZoom);
    },
    [layoutFor],
  );

  const fit = useCallback(() => {
    previousViewRef.current = { zoom: zoomRef.current, pan: { ...panRef.current } };
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const command = (event as CustomEvent<TakeoffCommand>).detail;
      const centerX = sizeRef.current.width / 2;
      const centerY = sizeRef.current.height / 2;
      const label = command.label.toLowerCase();
      if (label === "zoom" || label === "zoom in") {
        previousViewRef.current = { zoom: zoomRef.current, pan: { ...panRef.current } };
        zoomAtPoint(centerX, centerY, zoomRef.current * 1.25);
      } else if (label === "zoom out") {
        previousViewRef.current = { zoom: zoomRef.current, pan: { ...panRef.current } };
        zoomAtPoint(centerX, centerY, zoomRef.current / 1.25);
      } else if (label === "fit" || label === "fit page" || label === "fit drawing") {
        fit();
      } else if (label === "full screen") {
        void toggleFullscreen();
      } else if (label === "previous view" && previousViewRef.current) {
        const current = { zoom: zoomRef.current, pan: { ...panRef.current } };
        const previous = previousViewRef.current;
        previousViewRef.current = current;
        updateZoom(previous.zoom);
        updatePan(previous.pan);
      } else if (label === "rotate") {
        setPageRotation((value) => (value + 90) % 360);
        dispatchTakeoffStatus({ message: "Drawing rotated 90°" });
      } else if (label === "align") {
        fit();
        setPageRotation(0);
        setComparisonOffset({ x: 0, y: 0 });
        dispatchTakeoffStatus({ message: "Drawing and comparison revision aligned" });
      } else if (label === "opacity") {
        if (comparisonVisible) setComparisonPanel(true);
        else {
          const entered = window.prompt("Drawing opacity (10–100%)", String(Math.round(imageOpacity * 100)));
          const next = Number(entered);
          if (next >= 10 && next <= 100) setImageOpacity(next / 100);
        }
      } else if (label === "overlay") {
        if (!comparisonImages.length) {
          dispatchTakeoffStatus({ message: "No other drawing is available for revision overlay" });
          return;
        }
        setComparisonId((value) => value || comparisonImages[0].id);
        setComparisonMode("overlay");
        setComparisonVisible((value) => !value);
        setComparisonPanel(true);
        dispatchTakeoffStatus({ message: "Revision overlay toggled" });
      } else if (label === "compare") {
        if (!comparisonImages.length) {
          dispatchTakeoffStatus({ message: "No other drawing is available for comparison" });
          return;
        }
        setComparisonId((value) => value || comparisonImages[0].id);
        setComparisonMode("difference");
        setComparisonVisible(true);
        setComparisonPanel(true);
        dispatchTakeoffStatus({ message: "Revision difference comparison active" });
      } else if (label === "drawing") {
        setDrawingVisible((value) => !value);
      } else if (label === "takeoff") {
        setTakeoffVisible((value) => !value);
      }
    };
    window.addEventListener(TAKEOFF_COMMAND_EVENT, listener);
    return () => window.removeEventListener(TAKEOFF_COMMAND_EVENT, listener);
  }, [comparisonImages, comparisonVisible, fit, imageOpacity, updatePan, updateZoom, zoomAtPoint]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<TakeoffViewState>(TAKEOFF_VIEW_EVENT, {
        detail: { zoom, x: -pan.x, y: -pan.y, fullscreen: isFullscreen },
      }),
    );
  }, [isFullscreen, pan.x, pan.y, zoom]);

  useEffect(() => {
    if (!focusBox || !focusRequest) return;
    const [x0, y0, x1, y1] = focusBox;
    const boxWidth = Math.max(1, x1 - x0);
    const boxHeight = Math.max(1, y1 - y0);
    const availableWidth = Math.max(1, viewportSize.width - VIEW_PADDING * 4);
    const availableHeight = Math.max(1, viewportSize.height - VIEW_PADDING * 4);
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          availableWidth / (boxWidth * fitScale),
          availableHeight / (boxHeight * fitScale),
        ),
      ),
    );
    const renderedWidth = sourceWidth * fitScale * nextZoom;
    const renderedHeight = sourceHeight * fitScale * nextZoom;
    const baseLeft = (viewportSize.width - renderedWidth) / 2;
    const baseTop = (viewportSize.height - renderedHeight) / 2;
    const scale = fitScale * nextZoom;
    updateZoom(nextZoom);
    updatePan({
      x: viewportSize.width / 2 - (baseLeft + ((x0 + x1) / 2) * scale),
      y: viewportSize.height / 2 - (baseTop + ((y0 + y1) / 2) * scale),
    });
  }, [
    focusBox,
    focusRequest,
    fitScale,
    sourceHeight,
    sourceWidth,
    updatePan,
    updateZoom,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const bounds = viewport.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0025);
        zoomAtPoint(pointerX, pointerY, zoomRef.current * factor);
        return;
      }

      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? sizeRef.current.height
            : 1;
      let deltaX = event.deltaX * unit;
      let deltaY = event.deltaY * unit;
      if (event.shiftKey && Math.abs(deltaX) < Math.abs(deltaY)) {
        deltaX = deltaY;
        deltaY = 0;
      }
      updatePan({
        x: panRef.current.x - deltaX,
        y: panRef.current.y - deltaY,
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [updatePan, zoomAtPoint]);

  const toSourcePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const viewport = viewportRef.current;
      if (!viewport || !imageUrl) return null;
      const bounds = viewport.getBoundingClientRect();
      const layout = layoutFor(zoomRef.current, panRef.current);
      const x =
        ((clientX - bounds.left - layout.left) / Math.max(1, layout.width)) *
        sourceWidth;
      const y =
        ((clientY - bounds.top - layout.top) / Math.max(1, layout.height)) *
        sourceHeight;
      if (x < 0 || y < 0 || x > sourceWidth || y > sourceHeight) return null;
      return { x, y };
    },
    [imageUrl, layoutFor, sourceHeight, sourceWidth],
  );

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const forcePan = activeTool === "pan" || event.button === 1 || event.button === 2;
    if (!forcePan) return;
    previousViewRef.current = { zoom: zoomRef.current, pan: { ...panRef.current } };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPan: { ...panRef.current },
      moved: false,
    };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = pointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClient.x;
    const dy = event.clientY - drag.startClient.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    updatePan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = pointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function canvasClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (activeTool === "pan" || !onCanvasClick) return;
    const point = toSourcePoint(event.clientX, event.clientY);
    if (point) onCanvasClick(point, fitScale * zoomRef.current);
  }

  function canvasMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (activeTool !== "draw") return;
    const point = toSourcePoint(event.clientX, event.clientY);
    if (!point) return;
    onCanvasMove?.(point, fitScale * zoomRef.current);
    const drag = drawPointerRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) > 3)
        drag.moved = true;
      onCanvasDragMove?.(point, fitScale * zoomRef.current);
    }
  }

  function canvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (activeTool !== "draw" || event.button !== 0 || !onCanvasDragStart) return;
    const point = toSourcePoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawPointerRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    onCanvasDragStart(point, fitScale * zoomRef.current);
  }

  function canvasPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = drawPointerRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const point = toSourcePoint(event.clientX, event.clientY);
    suppressClickRef.current = drag.moved;
    drawPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (point) onCanvasDragEnd?.(point, fitScale * zoomRef.current);
  }

  function doubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!imageUrl) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    zoomAtPoint(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      zoomRef.current * 1.6,
    );
  }

  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const centerX = sizeRef.current.width / 2;
    const centerY = sizeRef.current.height / 2;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAtPoint(centerX, centerY, zoomRef.current * 1.25);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAtPoint(centerX, centerY, zoomRef.current / 1.25);
    } else if (event.key === "0") {
      event.preventDefault();
      fit();
    }
  }

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
      return;
    }
    await container.requestFullscreen();
  }

  const cursorClass =
    activeTool === "pan"
      ? "cursor-grab active:cursor-grabbing"
      : activeTool === "point" || activeTool === "draw"
        ? "cursor-crosshair"
        : "cursor-default";

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100 ${isFullscreen ? "bg-slate-200" : ""} ${className}`}
    >
      {!hideToolbar ? <div className="relative z-40 grid min-h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="min-w-0 justify-self-stretch overflow-visible">
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-1 justify-self-center">
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() =>
              zoomAtPoint(
                viewportSize.width / 2,
                viewportSize.height / 2,
                zoomRef.current / 1.25,
              )
            }
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-14 text-center text-xs font-semibold text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() =>
              zoomAtPoint(
                viewportSize.width / 2,
                viewportSize.height / 2,
                zoomRef.current * 1.25,
              )
            }
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={fit}
          >
            Fit
          </button>
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>
        <div className="min-w-0 justify-self-end">{toolbarRight}</div>
      </div> : null}

      <div
        ref={viewportRef}
        tabIndex={0}
        aria-label="Drawing viewer"
        className={`relative min-h-0 flex-1 overflow-hidden overscroll-none bg-slate-100 outline-none ${cursorClass}`}
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={doubleClick}
        onKeyDown={keyDown}
      >
        {imageUrl ? (
          <svg
            viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
            preserveAspectRatio="none"
            className="absolute select-none bg-white shadow-xl"
            style={{
              left: pageLeft,
              top: pageTop,
              width: pageWidth,
              height: pageHeight,
              transform: `rotate(${pageRotation}deg)`,
              transformOrigin: "center",
            }}
            onClick={canvasClick}
            onPointerDown={canvasPointerDown}
            onPointerMove={canvasMove}
            onPointerUp={canvasPointerUp}
            onPointerCancel={canvasPointerUp}
          >
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={sourceWidth}
              height={sourceHeight}
              preserveAspectRatio="none"
              opacity={drawingVisible ? imageOpacity : 0}
            />
            {comparisonVisible && comparisonImages.length ? (
              <image
                href={(comparisonImages.find((item) => item.id === comparisonId) || comparisonImages[0]).imageUrl}
                x={comparisonOffset.x}
                y={comparisonOffset.y}
                width={sourceWidth}
                height={sourceHeight}
                preserveAspectRatio="none"
                opacity={drawingVisible ? comparisonOpacity : 0}
                style={{ mixBlendMode: comparisonMode === "difference" ? "difference" : "multiply" }}
                pointerEvents="none"
              />
            ) : null}
            <DrawingZoomContext.Provider value={fitScale * zoom}>
              <g style={{ display: takeoffVisible ? undefined : "none" }}>{children}</g>
            </DrawingZoomContext.Provider>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Drawing preview is not ready.
          </div>
        )}

        {imageUrl ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-950/75 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm">
            Ctrl + wheel to zoom · Wheel to move · Middle-drag to move ·
            Double-click to zoom
          </div>
        ) : null}
        {comparisonVisible && comparisonPanel && comparisonImages.length ? (
          <div className="absolute right-3 top-3 z-40 w-72 rounded-xl border border-violet-200 bg-white/95 p-3 shadow-xl backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">Revision comparison</span>
              <button type="button" className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => setComparisonPanel(false)}>✕</button>
            </div>
            <select value={comparisonId || comparisonImages[0].id} onChange={(event) => setComparisonId(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs">
              {comparisonImages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <div className="mt-3 flex rounded-lg bg-slate-100 p-1">
              {(["overlay", "difference"] as const).map((mode) => <button key={mode} type="button" onClick={() => setComparisonMode(mode)} className={comparisonMode === mode ? "flex-1 rounded-md bg-white px-2 py-1.5 text-[11px] font-bold capitalize text-violet-700 shadow-sm" : "flex-1 px-2 py-1.5 text-[11px] font-semibold capitalize text-slate-500"}>{mode}</button>)}
            </div>
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Comparison opacity · {Math.round(comparisonOpacity * 100)}%</label>
            <input type="range" min="0.1" max="1" step="0.05" value={comparisonOpacity} onChange={(event) => setComparisonOpacity(Number(event.target.value))} className="mt-1 w-full accent-violet-600" />
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
              <label className="text-[9px] font-semibold text-slate-500">X offset<input type="number" value={comparisonOffset.x} onChange={(event) => setComparisonOffset((value) => ({ ...value, x: Number(event.target.value) || 0 }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>
              <label className="text-[9px] font-semibold text-slate-500">Y offset<input type="number" value={comparisonOffset.y} onChange={(event) => setComparisonOffset((value) => ({ ...value, y: Number(event.target.value) || 0 }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>
              <button type="button" className="self-end rounded-md border border-slate-200 px-2 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50" onClick={() => setComparisonOffset({ x: 0, y: 0 })}>Align</button>
            </div>
          </div>
        ) : comparisonVisible && comparisonImages.length ? (
          <button type="button" onClick={() => setComparisonPanel(true)} className="absolute right-3 top-3 z-40 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 shadow">Compare</button>
        ) : null}
      </div>
    </div>
  );
}
