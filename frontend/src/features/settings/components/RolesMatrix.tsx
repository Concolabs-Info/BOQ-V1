"use client";

import { PERMISSION_GROUPS, PERMISSION_MATRIX, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "../rbac";
import { SettingsCard } from "./SettingsCard";

export function RolesMatrix() {
  return (
    <SettingsCard
      title="Roles"
      description="Built-in company roles. People get one of these when you invite them with a Clerk application invitation."
      footerHint="Owner / Admin is a promotion from the members list, not an invite option."
    >
      <div className="space-y-6">
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {ROLES.map((role) => (
            <li key={role} className="px-5 py-4">
              <p className="text-sm font-semibold text-slate-950">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
            </li>
          ))}
        </ul>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[720px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Permission</th>
                {ROLES.map((role) => (
                  <th key={role} className="px-2 py-3 text-center">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.flatMap((group) =>
                group.keys.map((item, index) => (
                  <tr key={item.key} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-700">
                      {index === 0 ? <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.title}</span> : null}
                      {item.name}
                    </td>
                    {ROLES.map((role) => {
                      const allowed = PERMISSION_MATRIX[item.key]?.includes(role);
                      return (
                        <td key={role} className="px-2 py-2.5 text-center text-slate-500">
                          {allowed ? "•" : ""}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SettingsCard>
  );
}
