"use client";

import { useState } from "react";
import { AUTH_CONTROL_CLASS } from "@/features/auth/components/AuthField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/shared/components/Button";
import { ASSIGNABLE_ROLES, DEFAULT_INVITE_ROLE, roleLabel } from "@/features/settings/rbac";
import { ProjectAccessField, type ProjectOption } from "@/features/settings/components/ProjectAccessPicker";
import { sendInvites } from "../api";

type Row = { email: string; role: string };

export function InviteStep({
  onDone,
  projects = [],
}: {
  onDone: () => void;
  projects?: ProjectOption[];
}) {
  const [rows, setRows] = useState<Row[]>([{ email: "", role: DEFAULT_INVITE_ROLE }]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function send() {
    const invites = rows
      .map((row) => ({ email: row.email.trim(), role: row.role, workspace_ids: projectIds }))
      .filter((row) => row.email);
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
      const existingCount = result.existing_accounts?.length ?? 0;
      let existingNote = "";
      if (existingCount === 1) {
        existingNote = " One person already has an account and will join when they next sign in.";
      } else if (existingCount > 1) {
        existingNote = " Some people already have accounts and will join when they next sign in.";
      }
      setNote(
        `Sent ${result.sent}.${existingNote} Problems: ` +
          result.failures.map((failure) => `${failure.email} (${failure.reason})`).join(", "),
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
              className={`${AUTH_CONTROL_CLASS} flex-1`}
              value={row.email}
              onChange={(event) => update(index, { email: event.target.value })}
            />
            <Select value={row.role} onValueChange={(next) => update(index, { role: String(next) })}>
              <SelectTrigger className="sm:w-[15.5rem] sm:shrink-0">
                <SelectValue>{roleLabel(row.role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-sm font-medium text-slate-500 hover:text-slate-950"
          onClick={() => setRows((current) => [...current, { email: "", role: DEFAULT_INVITE_ROLE }])}
        >
          + Add another
        </button>
      </div>

      {projects.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-slate-950">Projects</p>
          <ProjectAccessField projects={projects} selectedIds={projectIds} disabled={pending} onChange={setProjectIds} />
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-500">
          You can add them to a project later from Settings → Members.
        </p>
      )}

      {note ? <p className="text-sm leading-6 text-slate-500">{note}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" pending={pending} className="h-11 rounded-xl" onClick={() => void send()}>
          {pending ? "Sending…" : "Send invitations"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} className="h-11 rounded-xl" onClick={onDone}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
