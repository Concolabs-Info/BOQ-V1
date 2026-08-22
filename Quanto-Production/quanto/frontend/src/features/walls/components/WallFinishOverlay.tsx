"use client";

import type { WallFace } from "../wallFinishTypes";

const UNASSIGNED_COLOUR = "#94a3b8";

function background(face: WallFace) {
  return face.zones.find((item) => item.zone_type === "background") || face.zones[0];
}

function faceColour(face: WallFace) {
  const zone = background(face);
  return zone?.finish_id ? zone.display_colour || "#64748b" : UNASSIGNED_COLOUR;
}

function halfGeometry(face: WallFace, sideCode: "A" | "B") {
  const geometry = face.model_geometry;
  if (!geometry) return null;
  const line = face.line;
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const sideAFirst = vertical ? dy >= 0 : dx < 0;
  const first = sideCode === "A" ? sideAFirst : !sideAFirst;

  if (vertical) {
    const width = geometry.width / 2;
    return {
      x: first ? geometry.x : geometry.x + width,
      y: geometry.y,
      width,
      height: geometry.height,
    };
  }

  const height = geometry.height / 2;
  return {
    x: geometry.x,
    y: first ? geometry.y : geometry.y + height,
    width: geometry.width,
    height,
  };
}

export function WallFinishOverlay({
  faces,
  selectedFaceId,
  onSelect,
}: {
  faces: WallFace[];
  selectedFaceId: string | null;
  onSelect: (faceId: string) => void;
}) {
  const ordered = [...faces].sort((left, right) => left.side_code.localeCompare(right.side_code));
  const reference = ordered[0];
  if (!reference) return null;

  const selected = ordered.some((face) => face.id === selectedFaceId);
  const selectedFace = ordered.find((face) => face.id === selectedFaceId);
  const defaultFace = selectedFace || ordered.find((face) => face.adjacent_room_id) || reference;
  const geometry = reference.model_geometry;

  if (!geometry) {
    const line = reference.line;
    const zone = background(defaultFace);
    return (
      <g opacity={reference.model_element_excluded ? 0.42 : 1}>
        <line
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke="white"
          strokeWidth={selected ? 4 : 3}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke={faceColour(defaultFace)}
          strokeWidth={selected ? 2.1 : 1.15}
          strokeDasharray={zone?.finish_id ? undefined : "5 4"}
          vectorEffect="non-scaling-stroke"
          className="cursor-pointer"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(defaultFace.id);
          }}
        />
      </g>
    );
  }

  const faceA = ordered.find((face) => face.side_code === "A");
  const faceB = ordered.find((face) => face.side_code === "B");
  const assignedA = Boolean(faceA && background(faceA)?.finish_id);
  const assignedB = Boolean(faceB && background(faceB)?.finish_id);
  const colourA = faceA ? faceColour(faceA) : UNASSIGNED_COLOUR;
  const colourB = faceB ? faceColour(faceB) : UNASSIGNED_COLOUR;
  const sameAssignedColour = assignedA && assignedB && colourA.toLowerCase() === colourB.toLowerCase();
  const outlineColour = sameAssignedColour ? colourA : assignedA || assignedB ? "#475569" : UNASSIGNED_COLOUR;

  return (
    <g opacity={reference.model_element_excluded ? 0.42 : 1}>
      {[faceA, faceB].map((face) => {
        if (!face) return null;
        const half = halfGeometry(face, face.side_code);
        const assigned = Boolean(background(face)?.finish_id);
        if (!half || !assigned) return null;
        return (
          <rect
            key={face.id}
            {...half}
            fill={faceColour(face)}
            fillOpacity={0.34}
            stroke="none"
            pointerEvents="none"
          />
        );
      })}

      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        fill="transparent"
        stroke="white"
        strokeWidth={selected ? 4 : 3}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        fill="transparent"
        stroke={selected ? "#0f172a" : outlineColour}
        strokeWidth={selected ? 2.1 : 1.15}
        strokeDasharray={!assignedA && !assignedB ? "5 4" : undefined}
        vectorEffect="non-scaling-stroke"
        pointerEvents="stroke"
        className="cursor-pointer"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(defaultFace.id);
        }}
      >
        <title>{`${reference.friendly_number.replace(/-[AB]$/, "")} · Model item ${reference.model_item_number ?? "—"}`}</title>
      </rect>
    </g>
  );
}
