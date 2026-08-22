"use client";

import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import { drawingSvgTransform } from "@/features/drawings/components/DrawingOverlayControls";
import type { Point } from "@/features/drawing/types";
import type { CeilingDevice, CeilingFeature, CeilingFloor, CeilingOpening, CeilingZone, CeilingZoneCandidate } from "../types";

type Props = {
  floor: CeilingFloor | null;
  imageUrl: string | null;
  overlayImageUrl?: string | null;
  overlayOpacity?: number;
  overlayTransform?: string;
  zones: CeilingZone[];
  features: CeilingFeature[];
  openings: CeilingOpening[];
  devices: CeilingDevice[];
  candidates?: CeilingZoneCandidate[];
  selectedZoneIds: Set<string>;
  selectedFeatureId: string | null;
  drawing: boolean;
  draftPoints: Point[];
  onPoint: (point: Point) => void;
  onZone: (zoneId: string, additive: boolean) => void;
  onFeature: (featureId: string) => void;
};

function points(value?: Point[]) {
  return (value || []).map((point) => `${point.x},${point.y}`).join(" ");
}

function featureColour(feature: CeilingFeature) {
  if (feature.status === "needs_review") return "#d97706";
  if (feature.scope_state === "demolish_remove") return "#dc2626";
  return "#7c3aed";
}

export function CeilingPlanCanvas({ floor, imageUrl, overlayImageUrl, overlayOpacity = 0.55, overlayTransform, zones, features, openings, devices, candidates = [], selectedZoneIds, selectedFeatureId, drawing, draftPoints, onPoint, onZone, onFeature }: Props) {
  if (!floor) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a floor to view its plan.</div>;
  const registeredTransform=overlayTransform || drawingSvgTransform(floor.coordination_drawings.find((item)=>item.drawing_type==="reflected_ceiling_plan"));
  return (
    <DrawingCanvas
      key={floor.id}
      imageUrl={imageUrl}
      width={floor.drawing_width}
      height={floor.drawing_height}
      tool={drawing ? "draw" : "select"}
      onCanvasClick={onPoint}
      className="min-h-[560px] flex-1"
    >
      {overlayImageUrl ? <image href={overlayImageUrl} x={0} y={0} width={floor.drawing_width} height={floor.drawing_height} preserveAspectRatio="none" opacity={overlayOpacity} transform={registeredTransform} className="pointer-events-none" /> : null}
      {candidates.filter((candidate) => candidate.status === "needs_review").map((candidate) => <polygon key={candidate.id} points={points(candidate.geometry.points)} fill="#a855f7" fillOpacity={0.12} stroke="#7e22ce" strokeDasharray="7 5" strokeWidth={2.5} vectorEffect="non-scaling-stroke"><title>{candidate.label || "Ceiling plan item"}</title></polygon>)}
      {zones.map((zone) => {
        const selected = selectedZoneIds.has(zone.id);
        const unassigned = !zone.definition_id && !["no_ceiling", "exposed_structure", "no_work"].includes(zone.scope_state);
        return (
          <g key={zone.id} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onZone(zone.id, event.shiftKey || event.ctrlKey || event.metaKey); }}>
            <polygon
              points={points(zone.geometry.points)}
              fill={zone.display_colour || (unassigned ? "#94a3b8" : "#60a5fa")}
              fillOpacity={zone.scope_state === "demolish_remove" ? 0.14 : selected ? 0.48 : 0.28}
              stroke={selected ? "#1d4ed8" : unassigned ? "#d97706" : zone.status === "confirmed" ? "#047857" : "#475569"}
              strokeDasharray={zone.scope_state === "demolish_remove" || zone.scope_state === "existing_to_remain" ? "8 5" : undefined}
              strokeWidth={selected ? 4 : 2}
              vectorEffect="non-scaling-stroke"
            />
            {zone.geometry.points.length ? (
              <text
                x={zone.geometry.points.reduce((sum, point) => sum + point.x, 0) / zone.geometry.points.length}
                y={zone.geometry.points.reduce((sum, point) => sum + point.y, 0) / zone.geometry.points.length}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
                fontSize={13}
                fontWeight={700}
                paintOrder="stroke"
                stroke="white"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
                className="pointer-events-none"
              >
                {zone.zone_number || "C"} {zone.definition_code || "?"}{zone.height_mm ? ` · ${zone.height_mm} mm` : ""}{zone.profile_type === "sloped" ? " · SLOPED" : ""}
              </text>
            ) : null}
          </g>
        );
      })}
      {openings.map((opening) => <polygon key={opening.id} points={points(opening.geometry.points)} fill="white" fillOpacity={0.85} stroke="#dc2626" strokeDasharray="5 4" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      {features.map((feature) => {
        const geometry = feature.geometry || {};
        const featurePoints = geometry.points || [];
        const point = geometry.point || featurePoints[0];
        const selected = selectedFeatureId === feature.id;
        if (feature.measurement_basis === "area" && featurePoints.length >= 3) return <polygon key={feature.id} points={points(featurePoints)} fill={featureColour(feature)} fillOpacity={0.28} stroke={selected ? "#1d4ed8" : featureColour(feature)} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onFeature(feature.id); }} />;
        if (feature.measurement_basis === "length" && featurePoints.length >= 2) return <polyline key={feature.id} points={points(featurePoints)} fill="none" stroke={selected ? "#1d4ed8" : featureColour(feature)} strokeWidth={selected ? 5 : 3} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onFeature(feature.id); }} />;
        return point ? <circle key={feature.id} cx={point.x} cy={point.y} r={selected ? 8 : 6} fill={featureColour(feature)} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onFeature(feature.id); }} /> : null;
      })}
      {devices.map((device) => {
        const point = device.geometry.point || device.geometry.points?.[0];
        return point ? <g key={device.id} className="pointer-events-none"><circle cx={point.x} cy={point.y} r={5} fill="#0ea5e9" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" /><title>{device.device_type} · {device.discipline}</title></g> : null;
      })}
      {draftPoints.length ? <>
        <polyline points={points(draftPoints)} fill={draftPoints.length >= 3 ? "rgba(37,99,235,.16)" : "none"} stroke="#2563eb" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {draftPoints.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={4} fill="#2563eb" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      </> : null}
    </DrawingCanvas>
  );
}
