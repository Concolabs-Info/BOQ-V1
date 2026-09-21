"use client";

import { useUser } from "@clerk/nextjs";
import { FormEvent, useEffect, useRef, useState } from "react";
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
  updateInvite,
  updateMemberRole,
  type CompanyMember,
  type CompanyRole,
  type PendingInvite,
} from "../api";
import { DEFAULT_INVITE_ROLE, isProjectScoped, roleLabel } from "../rbac";
import { joinProjectNames, MemberProjectControl, ProjectAccessField, ProjectChipList, projectNames } from "./ProjectAccessPicker";
import { SettingsCard, SettingsStack, SettingsStatus } from "./SettingsCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Flash = { kind: "ok" | "error"; text: string } | null;
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
  const [inviteFlash, setInviteFlash] = useState<Flash>(null);
  const [memberFlash, setMemberFlash] = useState<Flash>(null);
  const [pendingFlash, setPendingFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(DEFAULT_INVITE_ROLE);
  const [inviteProjects, setInviteProjects] = useState<string[]>([]);
  const assigningRef = useRef<Set<string>>(new Set());

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
    const nextProjects = projectList.projects.map((project) => ({ id: project.id, name: project.name }));
    setProjects(nextProjects);
    setRoles(roleList.roles);
    setInviteProjects((current) => current.filter((id) => nextProjects.some((project) => project.id === id)));
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

  async function run(action: () => Promise<unknown>, success: string, scope: "members" | "pending") {
    setBusy(true);
    setError(null);
    setInviteFlash(null);
    setMemberFlash(null);
    setPendingFlash(null);
    try {
      const custom = await action();
      await reload();
      const flash = { kind: "ok" as const, text: typeof custom === "string" && custom ? custom : success };
      if (scope === "members") setMemberFlash(flash);
      else setPendingFlash(flash);
    } catch (next) {
      const flash = { kind: "error" as const, text: settingsError(next) };
      if (scope === "members") setMemberFlash(flash);
      else setPendingFlash(flash);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      setInviteFlash({ kind: "error", text: "Enter an email address." });
      return;
    }
    setBusy(true);
    setInviteFlash(null);
    try {
      const result = await sendInvites([
        { email, role: inviteRole, workspace_ids: inviteProjects },
      ]);
      if (result.failures.length > 0 && result.sent === 0) {
        setInviteFlash({
          kind: "error",
          text: result.failures.map((failure: { email: string; reason: string }) => `${failure.email}: ${failure.reason}`).join(" "),
        });
        return;
      }
      const picked = projectNames(projects, inviteProjects);
      setInviteEmail("");
      setInviteProjects([]);
      await reload();
      setInviteFlash({
        kind: result.failures.length ? "error" : "ok",
        text: sentInviteMessage(email, result, picked),
      });
    } catch (next) {
      setInviteFlash({ kind: "error", text: settingsError(next) });
    } finally {
      setBusy(false);
    }
  }

  async function setMemberProjects(member: CompanyMember, nextIds: string[]) {
    const previous = member.workspace_ids || [];
    const unique = [...new Set(nextIds)];
    const add = unique.filter((id) => !previous.includes(id));
    const remove = previous.filter((id) => !unique.includes(id));
    if (add.length === 0 && remove.length === 0) return;
    if (assigningRef.current.has(member.id)) return;
    assigningRef.current.add(member.id);

    setMembers((current) => current.map((row) => (row.id === member.id ? { ...row, workspace_ids: unique } : row)));
    setBusyMember(member.id);
    setMemberFlash(null);
    try {
      await Promise.all([
        ...add.map((id) => assignMemberProject(member.id, id)),
        ...remove.map((id) => unassignMemberProject(member.id, id)),
      ]);
      setMemberFlash({ kind: "ok", text: projectAccessMessage(projects, previous, unique) });
    } catch (next) {
      setMembers((current) => current.map((row) => (row.id === member.id ? { ...row, workspace_ids: previous } : row)));
      setMemberFlash({ kind: "error", text: settingsError(next) });
    } finally {
      assigningRef.current.delete(member.id);
      setBusyMember(null);
    }
  }

  async function patchInvite(invite: PendingInvite, patch: { role?: string; workspace_ids?: string[] }, success: string) {
    if (assigningRef.current.has(invite.id)) return;
    assigningRef.current.add(invite.id);
    const previous = invite;
    setInvites((current) => current.map((row) => (row.id === invite.id ? { ...row, ...patch } : row)));
    setBusyMember(invite.id);
    setPendingFlash(null);
    try {
      const next = await updateInvite(invite.id, patch);
      setInvites((current) =>
        current.map((row) =>
          row.id === invite.id ? { ...row, ...next, existing_account: next.existing_account ?? row.existing_account } : row,
        ),
      );
      setPendingFlash({ kind: "ok", text: success });
    } catch (next) {
      setInvites((current) => current.map((row) => (row.id === invite.id ? previous : row)));
      setPendingFlash({ kind: "error", text: settingsError(next) });
    } finally {
      assigningRef.current.delete(invite.id);
      setBusyMember(null);
    }
  }

  function setInviteProjectsFor(invite: PendingInvite, nextIds: string[]) {
    const previous = invite.workspace_ids || [];
    const unique = [...new Set(nextIds)];
    const add = unique.filter((id) => !previous.includes(id));
    const remove = previous.filter((id) => !unique.includes(id));
    if (add.length === 0 && remove.length === 0) return;
    void patchInvite(invite, { workspace_ids: unique }, projectAccessMessage(projects, previous, unique));
  }

  const inviteRoleOptions = assignableRoleOptions(roles, inviteRole);

  if (loading) return <LoadingState label="Loading members" />;

  return (
    <SettingsStack>
      {error ? <ErrorMessage message={error} /> : null}

      {canManage ? (
        <SettingsCard
          title="Invite a member"
          description="They'll get an email to join. You can change their role and projects after you send this."
        >
          <form className="flex flex-col gap-4" onSubmit={(event) => void invite(event)}>
            <div
              className={
                projects.length > 0
                  ? "grid items-start gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(16.5rem,18rem)_minmax(0,1fr)]"
                  : "grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(16.5rem,18rem)]"
              }
            >
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-950">Email</span>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={inviteEmail}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 overflow-hidden">
                <span className="text-sm font-medium text-slate-950">Role</span>
                <Select value={inviteRole} disabled={busy} onValueChange={(next) => setInviteRole(String(next))}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue>
                      {inviteRoleOptions.find((role) => role.key === inviteRole)?.name ?? roleLabel(inviteRole)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {inviteRoleOptions.map((role) => (
                      <SelectItem key={role.key} value={role.key}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {projects.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-sm font-medium text-slate-950">Projects</p>
                  <ProjectAccessField
                    projects={projects}
                    selectedIds={inviteProjects}
                    disabled={busy}
                    emptyHint=""
                    onChange={setInviteProjects}
                  />
                </div>
              ) : null}
            </div>
            {projects.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">Create a project first, then you can add people to it.</p>
            ) : inviteProjects.length === 0 ? (
              <p className="text-sm leading-6 text-slate-500">Projects are optional. Assign them now or later from pending invitations.</p>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="submit" disabled={busy} className="h-11 w-fit shrink-0 rounded-xl">
                {busy ? "Sending…" : "Send invitation"}
              </Button>
              {inviteFlash ? (
                <SettingsStatus kind={inviteFlash.kind} className="min-w-0 flex-1">
                  {inviteFlash.text}
                </SettingsStatus>
              ) : null}
            </div>
          </form>
        </SettingsCard>
      ) : null}

      <SettingsCard
        title="Members"
        description="Role is what they can do. Projects are which jobs they can open."
        action={memberFlash ? <SettingsStatus kind={memberFlash.kind} className="max-w-[16rem] text-right">{memberFlash.text}</SettingsStatus> : undefined}
        contentClassName={members.length > 0 ? "px-0 pb-0 pt-4" : undefined}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[18rem] py-3 pl-6 pr-4">Member</th>
                <th className="w-[16.5rem] px-4 py-3">Role</th>
                <th className="px-4 py-3">Projects</th>
                <th className="w-32 py-3 pl-4 pr-6 text-right">Actions</th>
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
                  const roleOptions = memberRoleOptions(roles, member);
                  return (
                    <tr key={member.id} className="[&:last-child>td]:pb-5">
                      <td className="py-3.5 pl-6 pr-4 align-middle">
                        <p className="truncate font-medium text-slate-950">{member.full_name || member.email}</p>
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      </td>
                      <td className="min-w-0 px-4 py-3.5 align-middle">
                        {canManage && !isSelf ? (
                          <Select
                            value={member.role}
                            disabled={busy}
                            onValueChange={(next) => {
                              const nextRole = String(next);
                              if (nextRole === "admin") {
                                setConfirm({ kind: "promote", member });
                                return;
                              }
                              void run(() => updateMemberRole(member.id, nextRole), "Role updated.", "members");
                            }}
                          >
                            <SelectTrigger className="h-10 w-full min-w-0 px-3">
                              <SelectValue>
                                {roleOptions.find((role) => role.key === member.role)?.name ?? member.role_label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role.key} value={role.key}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-slate-700">{member.role_label || roleLabel(member.role)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        {!isProjectScoped(member.role) ? (
                          <p className="text-sm text-slate-700">All projects</p>
                        ) : canManage ? (
                          <MemberProjectControl
                            projects={projects}
                            assignedIds={assigned}
                            disabled={busy || busyMember === member.id}
                            onChange={(ids) => {
                              void setMemberProjects(member, ids);
                            }}
                          />
                        ) : (
                          <ProjectChipList projects={projects} ids={assigned} empty="No projects" />
                        )}
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right align-middle">
                        {canManage && !isSelf ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                            onClick={() => setConfirm({ kind: "remove", member })}
                          >
                            Remove
                          </button>
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
        title="Pending invitations"
        description="Waiting to join. You can still change their role or which jobs they can open."
        action={pendingFlash ? <SettingsStatus kind={pendingFlash.kind} className="max-w-[16rem] text-right">{pendingFlash.text}</SettingsStatus> : undefined}
        contentClassName={invites.length > 0 ? "px-0 pb-0 pt-4" : undefined}
        footerHint={invites.length === 0 ? "Invites expire if they aren't accepted." : undefined}
      >
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invites.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
              <thead className="border-y border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-[18rem] py-3 pl-6 pr-4">Email</th>
                  <th className="w-[16.5rem] px-4 py-3">Role</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="w-40 py-3 pl-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((invite) => {
                  const roleOptions = assignableRoleOptions(roles, invite.role);
                  return (
                    <tr key={invite.id} className="[&:last-child>td]:pb-5">
                      <td className="py-3.5 pl-6 pr-4 align-middle">
                        <p className="truncate text-slate-950">{invite.email}</p>
                        {invite.existing_account ? (
                          <p className="mt-0.5 text-xs leading-5 text-slate-500">Already has an account — joins when they next open Quanto</p>
                        ) : null}
                      </td>
                      <td className="min-w-0 px-4 py-3.5 align-middle">
                        {canManage ? (
                          <Select
                            value={invite.role}
                            disabled={busy || busyMember === invite.id}
                            onValueChange={(next) => {
                              void patchInvite(invite, { role: String(next) }, "Role updated.");
                            }}
                          >
                            <SelectTrigger className="h-10 w-full min-w-0 px-3">
                              <SelectValue>
                                {roleOptions.find((role) => role.key === invite.role)?.name ?? roleLabel(invite.role)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role.key} value={role.key}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-slate-700">
                            {roles.find((role) => role.key === invite.role)?.name || roleLabel(invite.role)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        {canManage ? (
                          <MemberProjectControl
                            projects={projects}
                            assignedIds={invite.workspace_ids}
                            disabled={busy || busyMember === invite.id}
                            onChange={(ids) => setInviteProjectsFor(invite, ids)}
                          />
                        ) : (
                          <ProjectChipList projects={projects} ids={invite.workspace_ids} empty="None yet" />
                        )}
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right align-middle">
                        {canManage ? (
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              disabled={busy || busyMember === invite.id}
                              className="text-sm font-medium text-slate-600 hover:text-slate-950 disabled:opacity-40"
                              onClick={() =>
                                void run(async () => {
                                  const result = await resendInvite(invite.id);
                                  if (result.failures.length > 0 && result.sent === 0) {
                                    throw new Error(result.failures.map((failure) => failure.reason).join(" "));
                                  }
                                  if ((result.existing_accounts || []).length > 0) {
                                    return `${invite.email} already has an account. They'll join the next time they open Quanto.`;
                                  }
                                  return undefined;
                                }, "Invitation resent.", "pending")
                              }
                            >
                              Resend
                            </button>
                            <button
                              type="button"
                              disabled={busy || busyMember === invite.id}
                              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                              onClick={() => setConfirm({ kind: "revoke", invite })}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {confirm ? (
        <ConfirmOverlay
          pending={busy}
          {...confirmCopy(confirm)}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "promote") {
              void run(() => updateMemberRole(confirm.member.id, "admin"), "Role updated.", "members");
            } else if (confirm.kind === "remove") {
              void run(() => removeMember(confirm.member.id), "Member removed.", "members");
            } else {
              void run(() => revokeInvite(confirm.invite.id), "Invitation revoked.", "pending");
            }
          }}
        />
      ) : null}
    </SettingsStack>
  );
}

function sentInviteMessage(
  email: string,
  result: { sent: number; existing_accounts?: string[]; failures: { email: string; reason: string }[] },
  picked: string[],
): string {
  if (result.failures.length) {
    return `Sent ${result.sent}. Problems: ${result.failures.map((failure) => `${failure.email} (${failure.reason})`).join(", ")}`;
  }
  const existing = (result.existing_accounts || []).some((item) => item.toLowerCase() === email.toLowerCase());
  if (existing) {
    return `${email} already has an account. They'll join the next time they open Quanto.`;
  }
  if (picked.length) {
    return `Invitation sent to ${email}. They'll only see ${joinProjectNames(picked)}.`;
  }
  return `Invitation sent to ${email}. Assign a project below whenever you're ready.`;
}

function projectAccessMessage(
  projects: { id: string; name: string }[],
  previous: string[],
  unique: string[],
): string {
  const add = unique.filter((id) => !previous.includes(id));
  const remove = previous.filter((id) => !unique.includes(id));
  if (unique.length === 0) return "Removed from all projects.";
  if (add.length === 1 && remove.length === 0) {
    return `Added to ${projects.find((project) => project.id === add[0])?.name || "project"}.`;
  }
  if (remove.length === 1 && add.length === 0) {
    return `Removed from ${projects.find((project) => project.id === remove[0])?.name || "project"}.`;
  }
  return "Project access updated.";
}

function memberRoleOptions(roles: CompanyRole[], member: CompanyMember) {
  const options = roles.length
    ? roles.map((role) => ({ key: role.key, name: role.name }))
    : [{ key: member.role, name: member.role_label || roleLabel(member.role) }];
  if (!options.some((role) => role.key === member.role)) {
    options.push({ key: member.role, name: member.role_label || roleLabel(member.role) });
  }
  return options;
}

function confirmCopy(confirm: Exclude<Confirm, null>) {
  if (confirm.kind === "promote") {
    const who = confirm.member.full_name || confirm.member.email;
    return {
      title: "Promote to Owner / Admin",
      description: `${who} will be able to manage members and company settings.`,
      confirmLabel: "Promote",
      danger: false,
    };
  }
  if (confirm.kind === "remove") {
    const who = confirm.member.full_name || confirm.member.email;
    return {
      title: "Remove member",
      description: `${who} will lose access to this company.`,
      confirmLabel: "Remove",
      danger: true,
    };
  }
  return {
    title: "Revoke invitation",
    description: `Revoke the invitation for ${confirm.invite.email}? They will no longer be able to join with that email.`,
    confirmLabel: "Revoke",
    danger: true,
  };
}

function assignableRoleOptions(roles: CompanyRole[], current?: string) {
  const fromCompany = roles.filter((role) => role.key !== "admin").map((role) => ({ key: role.key, name: role.name }));
  const options = fromCompany.length ? fromCompany : [{ key: DEFAULT_INVITE_ROLE, name: roleLabel(DEFAULT_INVITE_ROLE) }];
  if (current && !options.some((role) => role.key === current)) {
    options.push({ key: current, name: roleLabel(current) });
  }
  return options;
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
