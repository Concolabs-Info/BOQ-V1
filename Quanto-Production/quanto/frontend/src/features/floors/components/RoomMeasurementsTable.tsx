"use client";

import type { Room } from "../types";

const metric = (value: number | null | undefined, unit: string) =>
  value == null ? "—" : `${Number(value).toFixed(2)} ${unit}`;

export function RoomMeasurementsTable({
  rooms,
  selectedId,
  onSelect,
}: {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (roomId: string) => void;
}) {
  const visible = rooms.filter((room) => !room.excluded && !room.is_finish_zone);
  const totals = visible.reduce(
    (result, room) => {
      const measurement = room.floor_measurement;
      result.area += Number(measurement?.area_m2 ?? room.area_m2 ?? 0);
      result.perimeter += Number(measurement?.gross_perimeter_m ?? room.perimeter_m ?? 0);
      result.doors += Number(measurement?.door_deduction_m ?? 0);
      result.other += Number(measurement?.manual_edge_deduction_m ?? 0);
      result.net += Number(measurement?.net_skirting_length_m ?? room.perimeter_m ?? 0);
      return result;
    },
    { area: 0, perimeter: 0, doors: 0, other: 0, net: 0 },
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-5">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Room measurements</h3>
          <p className="mt-1 text-xs text-slate-500">The common quantities used by finishes, floor works, waterproofing, and skirting.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Area</th>
                <th className="px-4 py-3 text-right">Gross perimeter</th>
                <th className="px-4 py-3 text-right">Doors</th>
                <th className="px-4 py-3 text-right">Other exclusions</th>
                <th className="px-4 py-3 text-right">Net skirting</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((room) => {
                const measurement = room.floor_measurement;
                const status = measurement?.measurement_status || (room.measurement_status === "correct" ? "ready" : "needs_review");
                return (
                  <tr
                    key={room.id}
                    className={selectedId === room.id ? "cursor-pointer bg-blue-50" : "cursor-pointer hover:bg-slate-50"}
                    onClick={() => onSelect(room.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{room.friendly_number} {room.name || "Room"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{room.room_type || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{metric(measurement?.area_m2 ?? room.area_m2, "m²")}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{metric(measurement?.gross_perimeter_m ?? room.perimeter_m, "m")}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{metric(measurement?.door_deduction_m ?? 0, "m")}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{metric(measurement?.manual_edge_deduction_m ?? 0, "m")}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{metric(measurement?.net_skirting_length_m ?? room.perimeter_m, "m")}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={status === "ready" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"}>{status.replaceAll("_", " ")}</span></td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length ? (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Floor total</td>
                  <td className="px-4 py-3 text-right">{metric(totals.area, "m²")}</td>
                  <td className="px-4 py-3 text-right">{metric(totals.perimeter, "m")}</td>
                  <td className="px-4 py-3 text-right">{metric(totals.doors, "m")}</td>
                  <td className="px-4 py-3 text-right">{metric(totals.other, "m")}</td>
                  <td className="px-4 py-3 text-right">{metric(totals.net, "m")}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {!visible.length ? <p className="p-8 text-center text-sm text-slate-500">No measured rooms are available on this floor.</p> : null}
      </div>
    </div>
  );
}
