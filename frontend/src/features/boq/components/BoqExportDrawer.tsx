"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import type { BoqExport } from "../types";
import { BoqDrawer } from "./BoqDrawer";
import { BoqExportHistory } from "./BoqExportHistory";

export type BoqExportMode = "combined" | "floor_breakdown" | "selected_floor";
const SELECT_FLOOR_VALUE = "select-floor";

export function BoqExportDrawer({
  open,
  floors,
  exports,
  stale,
  saving,
  error,
  initialMode = "combined",
  onClose,
  onCreate,
  onDownload,
}: {
  open: boolean;
  floors: Array<{ id: string; name: string }>;
  exports: BoqExport[];
  stale: boolean;
  saving: boolean;
  error: string | null;
  initialMode?: BoqExportMode;
  onClose: () => void;
  onCreate: (format: "pdf" | "xlsx" | "csv" | "json", mode: BoqExportMode, floorId: string | null) => Promise<void>;
  onDownload: (item: BoqExport) => Promise<void>;
}) {
  const [mode, setMode] = useState<BoqExportMode>(initialMode);
  const [floorId, setFloorId] = useState<string | null>(null);
  const disabled = saving || stale || (mode === "selected_floor" && !floorId);

  return (
    <BoqDrawer open={open} title="Download BOQ" width="max-w-3xl" onClose={onClose}>
      <div className="space-y-6 p-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layout</span>
              <Select value={mode} onValueChange={(value) => setMode(value as BoqExportMode)}>
                <SelectTrigger className="mt-2 bg-white">
                  <SelectValue placeholder="Select layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">Combined project</SelectItem>
                  <SelectItem value="floor_breakdown">Floor breakdown</SelectItem>
                  <SelectItem value="selected_floor">Selected floor only</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {mode === "selected_floor" ? (
              <label>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Floor</span>
                <Select value={floorId || SELECT_FLOOR_VALUE} onValueChange={(value) => setFloorId(value === SELECT_FLOOR_VALUE ? null : value)}>
                  <SelectTrigger className="mt-2 bg-white">
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_FLOOR_VALUE}>Select floor</SelectItem>
                    {floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={disabled} onClick={() => void onCreate("pdf", mode, floorId)}>PDF</Button>
            <Button variant="secondary" disabled={disabled} onClick={() => void onCreate("xlsx", mode, floorId)}>Excel</Button>
            <Button variant="secondary" disabled={disabled} onClick={() => void onCreate("csv", mode, floorId)}>CSV</Button>
            <Button variant="secondary" disabled={disabled} onClick={() => void onCreate("json", mode, floorId)}>JSON</Button>
          </div>
          {stale ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Refresh the BOQ before downloading.</p> : null}
        </section>

        {error ? <ErrorMessage message={error} /> : null}
        <BoqExportHistory exports={exports} onDownload={(item) => void onDownload(item)} />
      </div>
    </BoqDrawer>
  );
}
