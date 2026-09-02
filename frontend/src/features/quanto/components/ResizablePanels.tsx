"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
} from "react";

type ThreePaneProps = {
  children: ReactNode;
  storageKey: string;
  defaultLeft: number;
  defaultRight: number;
  collapsedLeft?: boolean;
  minLeft?: number;
  maxLeft?: number;
  minRight?: number;
  maxRight?: number;
  minCenter?: number;
  className?: string;
};

type TwoPaneProps = {
  children: ReactNode;
  storageKey: string;
  defaultRight: number;
  minRight?: number;
  maxRight?: number;
  minCenter?: number;
  className?: string;
};

type DragState = {
  pointerId: number;
  side: "left" | "right";
  startX: number;
  startLeft: number;
  startRight: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

function useStoredWidths(storageKey: string, defaultLeft: number, defaultRight: number) {
  const [left, setLeft] = useState(defaultLeft);
  const [right, setRight] = useState(defaultRight);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`quanto:panel-widths:${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { left?: number; right?: number };
        if (Number.isFinite(parsed.left)) setLeft(parsed.left as number);
        if (Number.isFinite(parsed.right)) setRight(parsed.right as number);
      }
    } catch {
      // The default layout remains available if browser storage is unavailable.
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        `quanto:panel-widths:${storageKey}`,
        JSON.stringify({ left, right }),
      );
    } catch {
      // Resizing still works for the current visit without browser storage.
    }
  }, [left, ready, right, storageKey]);

  return { left, right, setLeft, setRight };
}

function ResizeHandle({
  side,
  position,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onReset,
  hidden = false,
}: {
  side: "left" | "right";
  position: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, side: "left" | "right") => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReset: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      aria-label={`Resize ${side} panel`}
      title="Drag to resize · Double-click to reset"
      className="group absolute inset-y-0 z-40 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center bg-transparent outline-none lg:flex"
      style={side === "left" ? { left: position } : { right: position, transform: "translateX(50%)" }}
      onPointerDown={(event) => onPointerDown(event, side)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
    >
      <span className="h-full w-px bg-slate-200 transition group-hover:bg-blue-400 group-focus-visible:bg-blue-500 group-active:w-0.5 group-active:bg-blue-600" />
      <span className="absolute top-1/2 flex h-11 w-3 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[9px] leading-none text-slate-400 shadow-sm transition group-hover:border-blue-300 group-hover:text-blue-600 group-focus-visible:border-blue-400 group-focus-visible:text-blue-600">
        ⋮
      </span>
    </button>
  );
}

export function ResizableThreePane({
  children,
  storageKey,
  defaultLeft,
  defaultRight,
  collapsedLeft = false,
  minLeft = 180,
  maxLeft = 440,
  minRight = 250,
  maxRight = 720,
  minCenter = 440,
  className = "",
}: ThreePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const { left, right, setLeft, setRight } = useStoredWidths(storageKey, defaultLeft, defaultRight);
  const visibleLeft = collapsedLeft ? 44 : left;

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, side: "left" | "right") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      side,
      startX: event.clientX,
      startLeft: left,
      startRight: right,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const width = containerRef.current?.getBoundingClientRect().width;
    if (!drag || drag.pointerId !== event.pointerId || !width) return;
    const delta = event.clientX - drag.startX;
    if (drag.side === "left") {
      const available = width - right - minCenter;
      setLeft(clamp(drag.startLeft + delta, minLeft, Math.min(maxLeft, available)));
    } else {
      const available = width - visibleLeft - minCenter;
      setRight(clamp(drag.startRight - delta, minRight, Math.min(maxRight, available)));
    }
  }

  useEffect(
    () => () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={`relative grid min-h-0 grid-cols-1 grid-rows-[minmax(120px,25%)_minmax(240px,1fr)_minmax(160px,30%)] overflow-hidden overscroll-contain lg:grid-rows-1 lg:[grid-template-columns:var(--quanto-left)_minmax(0,1fr)_var(--quanto-right)] [&>aside]:min-h-0 [&>aside]:overflow-y-auto [&>aside]:overscroll-contain [&>main]:min-h-0 [&>main]:overflow-hidden ${className}`}
      style={{ "--quanto-left": `${visibleLeft}px`, "--quanto-right": `${right}px` } as CSSProperties}
    >
      {children}
      <ResizeHandle
        side="left"
        position={visibleLeft}
        hidden={collapsedLeft}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onReset={() => setLeft(defaultLeft)}
      />
      <ResizeHandle
        side="right"
        position={right}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onReset={() => setRight(defaultRight)}
      />
    </div>
  );
}

export function ResizableTwoPane({
  children,
  storageKey,
  defaultRight,
  minRight = 250,
  maxRight = 720,
  minCenter = 520,
  className = "",
}: TwoPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const { right, setRight } = useStoredWidths(storageKey, 0, defaultRight);

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, side: "left" | "right") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      side,
      startX: event.clientX,
      startLeft: 0,
      startRight: right,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const width = containerRef.current?.getBoundingClientRect().width;
    if (!drag || drag.pointerId !== event.pointerId || !width) return;
    setRight(clamp(drag.startRight - (event.clientX - drag.startX), minRight, Math.min(maxRight, width - minCenter)));
  }

  useEffect(
    () => () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={`relative grid min-h-0 grid-cols-1 grid-rows-[minmax(240px,1fr)_minmax(160px,30%)] overflow-hidden overscroll-contain lg:grid-rows-1 lg:[grid-template-columns:minmax(0,1fr)_var(--quanto-right)] [&>aside]:min-h-0 [&>aside]:overflow-y-auto [&>aside]:overscroll-contain [&>main]:min-h-0 [&>main]:overflow-hidden ${className}`}
      style={{ "--quanto-right": `${right}px` } as CSSProperties}
    >
      {children}
      <ResizeHandle
        side="right"
        position={right}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onReset={() => setRight(defaultRight)}
      />
    </div>
  );
}
