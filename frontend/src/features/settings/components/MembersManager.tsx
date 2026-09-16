"use client";

import { useUser } from "@clerk/nextjs";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { listProjects } from "@/features/projects/services/projectService";
import { getPlatformContext } from "@/features/platform/services/platformService";
import {
  assignMemberProject,
  getMemberDirectory,
  listCompanyRoles,
  removeMember,
  resendInvite,
  revokeInvite,
  sendInvites,
  settingsError,
  unassignMemberProject,
  updateMemberRole,
  type CompanyMember,
  type CompanyRole,
  type PendingInvite,
} from "../api";
import { DEFAULT_INVITE_ROLE, roleLabel } from "../rbac";
import { SettingsCard, SettingsStack } from "./SettingsCard";

type Confirm =
  | { kind: "promote"; member: CompanyMember }
  | { kind: "remove"; member: CompanyMember }
  | { kind: "revoke"; invite: PendingInvite }
  | null;

export function MembersManager() {
  const { user } = useUser();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(DEFAULT_INVITE_ROLE);
  const [inviteProjects, setInviteProjects] = useState<string[]>([]);

  async function reload() {
    const [directory, context, projectList, roleList] = await Promise.all([
      getMemberDirectory(),
      getPlatformContext(),
      listProjects({ limit: 100, offset: 0 }).catch(() => ({ projects: [], total: 0, limit: 100, offset: 0 })),
      listCompanyRoles().catch(() => ({ roles: [] })),
    ]);
    setMembers(directory.members);
    setInvites(directory.invitations);
    setCanManage(context.permissions.includes("members:manage"));
    setProjects(projectList.projects.map((project) => ({ id: project.id, name: project.name })));
    setRoles(roleList.roles);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    reload()
      .catch((next) => {
        if (mounted) setError(settingsError(next));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
      await reload();
      setNote(success);
    } catch (next) {
      setError(settingsError(next));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      setError("Enter an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await sendInvites([
        { email, role: inviteRole, workspace_ids: inviteProjects },
      ]);
      if (result.failures.length > 0 && result.sent === 0) {
        setError(result.failures.map((failure: { email: string; reason: string }) => `${failure.email}: ${failure.reason}`).join(" "));
        return;
      }
      setInviteEmail("");
      setInviteRole(DEFAULT_INVITE_ROLE);
      setInviteProjects([]);
      await reload();
      setNote(
        result.failures.length
          ? `Sent ${result.sent}. Problems: ${result.failures.map((failure: { email: string; reason: string }) => `${failure.email} (${failure.reason})`).join(", ")}`
          : "Clerk invitation sent.",
      );
    } catch (next) {
      setError(settingsError(next));
    } finally {
      setBusy(false);
    }
  }

  function toggleProject(projectId: string) {
    setInviteProjects((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    );
  }

  if (loading) return <LoadingState label="Loading members" />;

  return (
    <SettingsStack>
      {error ? <ErrorMessage message={error} /> : null}
      {note ? <p className="text-sm font-medium text-emerald-700">{note}</p> : null}

      {canManage ? (
        <SettingsCard
          title="Invite a member"
          description="Clerk sends the invitation email. They join this company after they sign up with that address."
        >
          <form className="flex flex-col gap-4" onSubmit={(event) => void invite(event)}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={inviteEmail}
                disabled={busy}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
              <select
                value={inviteRole}
                disabled={busy}
                onChange={(event) => setInviteRole(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:w-52"
              >
                {(roles.filter((role) => role.key !== "admin").length
                  ? roles.filter((role) => role.key !== "admin").map((role) => ({ key: role.key, name: role.name }))
                  : [{ key: DEFAULT_INVITE_ROLE, name: roleLabel(DEFAULT_INVITE_ROLE) }]
                ).map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            {projects.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Projects (optional)
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {projects.map((project) => (
                    <label key={project.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={inviteProjects.includes(project.id)}
                        disabled={busy}
                        onChange={() => toggleProject(project.id)}
                      />
                      {project.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Button type="submit" disabled={busy} className="h-11 w-fit rounded-xl">
              {busy ? "Sending…" : "Send Clerk invitation"}
            </Button>
          </form>
        </SettingsCard>
      ) : null}

      <SettingsCard
        title="Members"
        description="Company role controls what they can do. Invitees join after they accept the Clerk email."
      >
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Projects</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.length === 0 ? (
                <tr>
                  <td className="px-6 py-6 text-slate-500" colSpan={4}>
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const isSelf = Boolean(user && member.id === user.id);
                  const assigned = member.workspace_ids || [];
                  const roleOptions: { key: string; name: string }[] = roles.length
                    ? roles.map((role) => ({ key: role.key, name: role.name }))
                    : [{ key: member.role, name: member.role_label || roleLabel(member.role) }];
                  if (!roleOptions.some((role) => role.key === member.role)) {
                    roleOptions.push({ key: member.role, name: member.role_label || roleLabel(member.role) });
                  }
                  return (
                    <tr key={member.id}>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-950">{member.full_name || member.email}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </td>
                      <td className="px-4 py-4">
                        {canManage && !isSelf ? (
                          <select
                            value={member.role}
                            disabled={busy}
                            onChange={(event) => {
                              const next = event.target.value;
                              if (next === "admin") {
                                setConfirm({ kind: "promote", member });
                                return;
                              }
                              void run(() => updateMemberRole(member.id, next), "Role updated.");
                            }}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            {roleOptions.map((role) => (
                              <option key={role.key} value={role.key}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-700">{member.role_label || roleLabel(member.role)}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {canManage ? (
                          <div className="flex max-w-xs flex-col gap-1">
                            {projects.length === 0 ? (
                              <span className="text-xs text-slate-500">No projects yet</span>
                            ) : (
                              projects.map((project) => (
                                <label key={project.id} className="flex items-center gap-2 text-xs text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={assigned.includes(project.id)}
                                    disabled={busy}
                                    onChange={(event) =>
                                      void run(
                                        () =>
                                          event.target.checked
                                            ? assignMemberProject(member.id, project.id)
                                            : unassignMemberProject(member.id, project.id),
                                        event.target.checked ? "Added to project." : "Removed from project.",
                                      )
                                    }
                                  />
                                  {project.name}
                                </label>
                              ))
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {assigned.length === 0 ? "—" : `${assigned.length} project${assigned.length === 1 ? "" : "s"}`}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canManage && !isSelf ? (
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busy}
                            className="rounded-xl"
                            onClick={() => setConfirm({ kind: "remove", member })}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Pending Clerk invitations"
        description="People who have been invited but have not joined yet. Resend revokes the previous Clerk invite and sends a new one."
        footerHint={invites.length === 0 ? "Invites expire if they are not accepted." : undefined}
      >
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invites.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="px-6 py-4 text-slate-950">{invite.email}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {roles.find((role) => role.key === invite.role)?.name || roleLabel(invite.role)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            className="rounded-xl"
                            onClick={() => void run(() => resendInvite(invite.id), "Clerk invitation resent.")}
                          >
                            Resend
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busy}
                            className="rounded-xl"
                            onClick={() => setConfirm({ kind: "revoke", invite })}
                          >
                            Revoke
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {confirm ? (
        <ConfirmOverlay
          pending={busy}
          title={
            confirm.kind === "promote"
              ? "Promote to Owner / Admin"
              : confirm.kind === "remove"
                ? "Remove member"
                : "Revoke invitation"
          }
          description={
            confirm.kind === "promote"
              ? `${confirm.member.full_name || confirm.member.email} will be able to manage members and company settings.`
              : confirm.kind === "remove"
                ? `${confirm.member.full_name || confirm.member.email} will lose access to this company.`
                : `Revoke the Clerk invitation for ${confirm.invite.email}? They will no longer be able to join with that email.`
          }
          confirmLabel={confirm.kind === "promote" ? "Promote" : confirm.kind === "remove" ? "Remove" : "Revoke"}
          danger={confirm.kind !== "promote"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "promote") {
              void run(() => updateMemberRole(confirm.member.id, "admin"), "Role updated.");
            } else if (confirm.kind === "remove") {
              void run(() => removeMember(confirm.member.id), "Member removed.");
            } else {
              void run(() => revokeInvite(confirm.invite.id), "Clerk invitation revoked.");
            }
          }}
        />
      ) : null}
    </SettingsStack>
  );
}

function ConfirmOverlay({
  title,
  description,
  confirmLabel,
  danger,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" className="rounded-xl" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            className="rounded-xl"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
