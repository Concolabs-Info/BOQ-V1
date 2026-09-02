import type { FloorDrawing } from "../types";

export function DrawingTypeTabs({
  drawings,
  selectedId,
  onSelect,
}: {
  drawings: FloorDrawing[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Floor drawings" className="flex flex-wrap gap-2">
      <DrawingTab
        id="architectural"
        label="Floor Plan"
        selected={selectedId === "architectural"}
        onSelect={onSelect}
      />
      {drawings.map((drawing) => (
        <DrawingTab
          key={drawing.id}
          id={drawing.id}
          label={drawing.name}
          selected={selectedId === drawing.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DrawingTab({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
        selected
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
      }`}
    >
      {label}
    </button>
  );
}
