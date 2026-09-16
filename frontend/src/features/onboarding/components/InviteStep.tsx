"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { sendInvites } from "../api";

const ROLE_LABELS: Record<string, string> = {
  chief_estimator: "Chief Estimator",
  qs: "Quantity Surveyor",
  technician: "Takeoff Technician",
  qa_checker: "QA Checker",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  viewer: "Client / Viewer",
};

type Row = { email: string; role: string };

export function InviteStep({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([{ email: "", role: "viewer" }]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function send() {
    const invites = rows.map((row) => ({ email: row.email.trim(), role: row.role })).filter((row) => row.email);
    if (invites.length === 0) {
      setNote("Add at least one email, or skip for now.");
      return;
    }
    setNote(null);
    setPending(true);
    try {
      const result = await sendInvites(invites);
      if (result.failures.length === 0) {
        onDone();
        return;
      }
      setNote(
        `Sent ${result.sent}. Problems: ` + result.failures.map((failure) => `${failure.email} (${failure.reason})`).join(", "),
      );
    } catch {
      setNote("Something went wrong sending invites. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="name@company.com"
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              value={row.email}
              onChange={(event) => update(index, { email: event.target.value })}
            />
            <select
              value={row.role}
              onChange={(event) => update(index, { role: event.target.value })}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:w-44"
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-sm font-medium text-slate-500 hover:text-slate-950"
          onClick={() => setRows((current) => [...current, { email: "", role: "viewer" }])}
        >
          + Add another
        </button>
      </div>

      {note ? <p className="text-sm leading-6 text-slate-500">{note}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={pending} className="h-11 rounded-xl" onClick={() => void send()}>
          {pending ? "Sending…" : "Send invites"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} className="h-11 rounded-xl" onClick={onDone}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
