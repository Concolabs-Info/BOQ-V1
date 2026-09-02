"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import type { Point } from "@/features/drawing/types";
import { drawingSvgTransform } from "@/features/drawings/components/DrawingOverlayControls";
import type { RoofComponent, RoofDrawing, RoofEdge, RoofOpening, RoofPlane } from "../types";

const edgeColours: Record<string, string> = {
  ridge: "#7c3aed", hip: "#2563eb", valley: "#dc2626", eave: "#15803d",
  verge: "#ea580c", rake: "#ea580c", abutment: "#64748b", parapet: "#475569",
  gutter: "#0891b2", valley_gutter: "#0891b2", channel: "#0891b2", unknown: "#d97706",
};

function svgPoints(value?: Point[]) { return (value || []).map((point) => `${point.x},${point.y}`).join(" "); }
function centroid(value: Point[]) { return value.length ? { x: value.reduce((sum, point) => sum + point.x, 0) / value.length, y: value.reduce((sum, point) => sum + point.y, 0) / value.length } : { x: 0, y: 0 }; }
function sourcePoint(event: ReactPointerEvent<SVGCircleElement>): Point | null {
  const svg = event.currentTarget.ownerSVGElement; const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse()); return { x: transformed.x, y: transformed.y };
}

export function RoofPlanCanvas({ drawing, imageUrl, overlayImageUrl, overlayOpacity, planes, edges, openings, components, selectedPlaneIds, selectedEdgeId, drawingMode, draftPoints, onPoint, onPlane, onEdge, onVertices }: {
  drawing: RoofDrawing | null; imageUrl: string | null; overlayImageUrl?: string | null; overlayOpacity: number;
  planes: RoofPlane[]; edges: RoofEdge[]; openings: RoofOpening[]; components: RoofComponent[];
  selectedPlaneIds: Set<string>; selectedEdgeId: string | null; drawingMode: boolean; draftPoints: Point[];
  onPoint: (point: Point) => void; onPlane: (id: string, additive: boolean) => void; onEdge: (id: string) => void;
  onVertices: (planeId: string, points: Point[]) => void;
}) {
  const [drag, setDrag] = useState<{ planeId: string; index: number; points: Point[]; pointerId: number } | null>(null);
  useEffect(() => setDrag(null), [drawing?.host_floor_id]);
  if (!drawing) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">Select a floor with a plan drawing.</div>;
  const transform = drawingSvgTransform(drawing.roof_drawing);
  return <DrawingCanvas key={drawing.host_floor_id} imageUrl={imageUrl} width={drawing.drawing_width} height={drawing.drawing_height} tool={drawingMode ? "draw" : "select"} onCanvasClick={onPoint} className="min-h-[590px] flex-1">
    {overlayImageUrl ? <image href={overlayImageUrl} x={0} y={0} width={drawing.drawing_width} height={drawing.drawing_height} preserveAspectRatio="none" opacity={overlayOpacity} transform={transform} className="pointer-events-none" /> : null}
    {planes.map((plane) => {
      const selected = selectedPlaneIds.has(plane.id); const planePoints = drag?.planeId === plane.id ? drag.points : plane.geometry.points;
      const centre = centroid(planePoints); const angle = Number(plane.slope_direction_degrees || 0) * Math.PI / 180; const arrow = { x: centre.x + Math.sin(angle) * 36, y: centre.y - Math.cos(angle) * 36 };
      return <g key={plane.id} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onPlane(plane.id, event.shiftKey || event.ctrlKey || event.metaKey); }}>
        <polygon points={svgPoints(planePoints)} fill={plane.display_colour || "#60a5fa"} fillOpacity={selected ? 0.48 : 0.28} stroke={selected ? "#1d4ed8" : plane.status === "confirmed" ? "#047857" : "#d97706"} strokeDasharray={plane.status === "confirmed" ? undefined : "7 4"} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" />
        <text x={centre.x} y={centre.y} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontSize={13} fontWeight={700} paintOrder="stroke" stroke="white" strokeWidth={4} className="pointer-events-none">{plane.name || "Roof plane"}{plane.pitch_degrees != null ? ` · ${Number(plane.pitch_degrees).toFixed(1)}°` : " · pitch ?"}</text>
        {plane.slope_direction_degrees != null ? <g className="pointer-events-none"><line x1={centre.x} y1={centre.y + 18} x2={arrow.x} y2={arrow.y} stroke="#0f172a" strokeWidth={2.5} vectorEffect="non-scaling-stroke" /><circle cx={arrow.x} cy={arrow.y} r={3} fill="#0f172a" /></g> : null}
        {selected && !drawingMode ? planePoints.map((point, index) => <circle key={`${plane.id}-${index}`} cx={point.x} cy={point.y} r={6} fill="white" stroke="#1d4ed8" strokeWidth={3} vectorEffect="non-scaling-stroke" className="cursor-move" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ planeId: plane.id, index, points: planePoints.map((item) => ({ ...item })), pointerId: event.pointerId }); }} onPointerMove={(event) => { if (!drag || drag.pointerId !== event.pointerId || drag.planeId !== plane.id) return; const point = sourcePoint(event); if (!point) return; setDrag({ ...drag, points: drag.points.map((item, itemIndex) => itemIndex === drag.index ? point : item) }); }} onPointerUp={(event) => { if (!drag || drag.pointerId !== event.pointerId) return; event.stopPropagation(); const points = drag.points; setDrag(null); onVertices(plane.id, points); }} />) : null}
      </g>;
    })}
    {edges.map((edge) => <polyline key={edge.id} points={svgPoints(edge.geometry.points)} fill="none" stroke={selectedEdgeId === edge.id ? "#0f172a" : edgeColours[edge.edge_type] || edgeColours.unknown} strokeDasharray={edge.edge_type === "unknown" ? "7 5" : undefined} strokeWidth={selectedEdgeId === edge.id ? 6 : 3} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onEdge(edge.id); }}><title>{edge.edge_type.replaceAll("_", " ")} · {Number(edge.true_length_m || 0).toFixed(2)} m</title></polyline>)}
    {openings.map((opening) => <polygon key={opening.id} points={svgPoints(opening.geometry.points)} fill="white" fillOpacity={0.9} stroke="#0f172a" strokeDasharray="4 3" strokeWidth={2} vectorEffect="non-scaling-stroke"><title>{opening.name || opening.opening_type}</title></polygon>)}
    {components.map((component) => { const points = component.geometry.points || []; const point = component.geometry.point || points[0]; if (component.measurement_basis === "area") return <polygon key={component.id} points={svgPoints(points)} fill="#06b6d4" fillOpacity={0.28} stroke="#0e7490" strokeWidth={2} vectorEffect="non-scaling-stroke"><title>{component.name || component.component_type}</title></polygon>; if (component.measurement_basis === "length") return <polyline key={component.id} points={svgPoints(points)} fill="none" stroke="#0891b2" strokeWidth={4} vectorEffect="non-scaling-stroke"><title>{component.name || component.component_type}</title></polyline>; return point ? <circle key={component.id} cx={point.x} cy={point.y} r={6} fill="#0891b2" stroke="white" strokeWidth={2}><title>{component.name || component.component_type}</title></circle> : null; })}
    {draftPoints.length ? <><polyline points={svgPoints(draftPoints)} fill={draftPoints.length >= 3 ? "rgba(37,99,235,.16)" : "none"} stroke="#2563eb" strokeWidth={3} vectorEffect="non-scaling-stroke" />{draftPoints.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={4} fill="#2563eb" stroke="white" strokeWidth={2} />)}</> : null}
  </DrawingCanvas>;
}
