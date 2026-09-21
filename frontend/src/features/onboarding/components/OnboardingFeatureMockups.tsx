"use client";

import type { ReactNode } from "react";
import { MousePointer2, Plus, Redo2, Ruler, Undo2, UserRound, ZoomIn } from "lucide-react";

/**
 * Abstract, illustrative mockups for the capabilities carousel — modeled on
 * the app's real UI patterns (role labels, card/table styling, the actual
 * toolbar commands from the takeoff editor) but not literal screenshots of
 * the real app.
 */

function ToolbarButton({ icon, label, active }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-medium ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

export function PlanReviewMockup() {
  return (
    <div className="w-80 rounded-xl border border-border bg-card p-4 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Ground Floor Plan</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ZoomIn className="size-3" aria-hidden="true" />
          100%
        </span>
      </div>

      {/* Mini toolbar, mirroring the real takeoff editor's commands */}
      <div className="mb-2 flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
        <ToolbarButton icon={<MousePointer2 className="size-3" aria-hidden="true" />} label="Select" active />
        <ToolbarButton icon={<Ruler className="size-3" aria-hidden="true" />} label="Measure" />
        <span className="mx-0.5 h-4 w-px bg-border" />
        <ToolbarButton icon={<Undo2 className="size-3" aria-hidden="true" />} label="Undo" />
        <ToolbarButton icon={<Redo2 className="size-3" aria-hidden="true" />} label="Redo" />
      </div>

      <div className="flex h-32 items-center justify-center rounded-lg bg-muted/50">
        <svg viewBox="0 0 140 100" className="h-28 w-40" fill="none">
          {/* Selected room — actively being measured */}
          <rect x="83" y="5" width="52" height="24" className="fill-primary/15" />
          <rect x="83" y="5" width="52" height="24" className="stroke-primary" strokeWidth="1.5" strokeDasharray="3 2" />
          {/* Already-measured room */}
          <rect x="111" y="31" width="24" height="48" className="fill-emerald-500/15" />
          <rect x="111" y="31" width="24" height="48" className="stroke-emerald-500" strokeWidth="1.5" />

          {/* Outer walls + room dividers — thin black linework, drawing convention */}
          <g stroke="#1e293b" strokeLinecap="square">
            <rect x="24" y="4" width="112" height="76" rx="1" strokeWidth="1.25" />
            {/* vertical divider, with a door gap into the top-right room */}
            <line x1="82" y1="4" x2="82" y2="15" strokeWidth="1" />
            <line x1="82" y1="24" x2="82" y2="80" strokeWidth="1" />
            <line x1="82" y1="15" x2="75" y2="24" strokeWidth="0.6" />
            {/* left horizontal divider, with a door gap */}
            <line x1="24" y1="42" x2="40" y2="42" strokeWidth="1" />
            <line x1="48" y1="42" x2="82" y2="42" strokeWidth="1" />
            <line x1="40" y1="42" x2="48" y2="49" strokeWidth="0.6" />
            {/* right horizontal divider, with a door gap */}
            <line x1="82" y1="31" x2="96" y2="31" strokeWidth="1" />
            <line x1="104" y1="31" x2="136" y2="31" strokeWidth="1" />
            <line x1="96" y1="31" x2="104" y2="38" strokeWidth="0.6" />
            {/* right vertical divider, with a door gap */}
            <line x1="111" y1="31" x2="111" y2="49" strokeWidth="1" />
            <line x1="111" y1="57" x2="111" y2="80" strokeWidth="1" />
            <line x1="111" y1="49" x2="118" y2="57" strokeWidth="0.6" />
          </g>

          {/* windows — thin double-line glazing symbol, standard blueprint blue */}
          <g stroke="#0284c7" strokeWidth="0.6">
            <line x1="34" y1="3" x2="50" y2="3" />
            <line x1="34" y1="5" x2="50" y2="5" />
            <line x1="23" y1="55" x2="23" y2="68" />
            <line x1="25" y1="55" x2="25" y2="68" />
            <line x1="100" y1="79" x2="116" y2="79" />
            <line x1="100" y1="81" x2="116" y2="81" />
          </g>

          {/* furniture hints */}
          <rect x="30" y="10" width="18" height="9" rx="1" className="fill-foreground/15" />
          <rect x="30" y="60" width="9" height="15" rx="1" className="fill-foreground/15" />

          {/* Dimension lines — overall width (bottom) and height (left), standard drawing red */}
          <g stroke="#dc2626" strokeWidth="0.5">
            <line x1="24" y1="80" x2="24" y2="91" opacity="0.7" />
            <line x1="136" y1="80" x2="136" y2="91" opacity="0.7" />
            <line x1="24" y1="89" x2="136" y2="89" />
            <line x1="26" y1="91" x2="22" y2="87" />
            <line x1="134" y1="91" x2="138" y2="87" />
            <text x="80" y="97.5" textAnchor="middle" fontWeight="400" fill="#dc2626" style={{ fontSize: 6 }}>
              7.2 m
            </text>

            <line x1="24" y1="4" x2="13" y2="4" opacity="0.7" />
            <line x1="24" y1="80" x2="13" y2="80" opacity="0.7" />
            <line x1="15" y1="4" x2="15" y2="80" />
            <line x1="13" y1="6" x2="17" y2="2" />
            <line x1="13" y1="78" x2="17" y2="82" />
            <text
              x="15"
              y="44"
              textAnchor="middle"
              fontWeight="400"
              fill="#dc2626"
              style={{ fontSize: 6 }}
              transform="rotate(-90 15 44)"
            >
              4.8 m
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

export function TakeoffMockup() {
  const rows: [string, string, string, string][] = [
    ["Concrete slab", "120 m²", "45.00", "5,400.00"],
    ["Blockwork", "80 m²", "32.00", "2,560.00"],
    ["Rebar", "1.2 t", "1,200.00", "1,440.00"],
  ];

  return (
    <div className="w-80 rounded-xl border border-border bg-card p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">BOQ Summary</span>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Auto-generated</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 text-[10px] text-muted-foreground">
          <span>Item</span>
          <span>Qty</span>
          <span>Rate</span>
          <span>Amount</span>
        </div>
        {rows.map(([item, qty, rate, amount]) => (
          <div
            key={item}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md bg-muted/50 px-2 py-1.5"
          >
            <span className="truncate text-xs text-foreground">{item}</span>
            <span className="text-xs text-muted-foreground">{qty}</span>
            <span className="text-xs text-muted-foreground">{rate}</span>
            <span className="text-xs font-medium text-foreground">{amount}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-border px-2 pt-2">
          <span className="text-xs font-medium text-foreground">Total</span>
          <span className="text-sm font-semibold text-foreground">9,400.00</span>
        </div>
      </div>
    </div>
  );
}

export function MultiProjectMockup() {
  const tiles: { name: string; accent: string; progress: number }[] = [
    { name: "Riverside Tower", accent: "bg-primary", progress: 72 },
    { name: "Ocean View", accent: "bg-orange-400", progress: 40 },
    { name: "Hillcrest", accent: "bg-green-500", progress: 90 },
  ];

  return (
    <div className="grid w-80 grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div key={tile.name} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className={`size-2 rounded-full ${tile.accent}`} />
            <span className="text-[10px] text-muted-foreground">{tile.progress}%</span>
          </div>
          <span className="truncate text-xs font-medium text-foreground">{tile.name}</span>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <span className={`block h-full rounded-full ${tile.accent}`} style={{ width: `${tile.progress}%` }} />
          </div>
        </div>
      ))}
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-3 text-muted-foreground">
        <Plus className="size-4" aria-hidden="true" />
        <span className="text-[10px]">New project</span>
      </div>
    </div>
  );
}

export function InviteMockup() {
  const people: { name: string; role: string; status: "Joined" | "Pending"; gradient: string }[] = [
    { name: "Ada Perera", role: "Chief Estimator", status: "Joined", gradient: "from-blue-400 to-indigo-500" },
    { name: "Kavi Silva", role: "Quantity Surveyor", status: "Pending", gradient: "from-orange-400 to-rose-500" },
    { name: "Mira Fernando", role: "QA Checker", status: "Pending", gradient: "from-emerald-400 to-teal-500" },
  ];

  return (
    <div className="w-80 rounded-xl border border-border bg-card p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Team</span>
        <span className="text-[10px] text-muted-foreground">{people.length} invited</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {people.map((person) => (
          <div key={person.name} className="flex items-center gap-2.5">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm ${person.gradient}`}
            >
              <UserRound className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{person.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{person.role}</p>
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                person.status === "Joined" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
              }`}
            >
              {person.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
