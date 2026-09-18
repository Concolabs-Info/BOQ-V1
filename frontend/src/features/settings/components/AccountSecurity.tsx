"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/components/Button";
import { AuthField } from "@/features/auth/components/AuthField";
import { SecuredByClerk } from "@/features/auth/components/SecuredByClerk";
import { thrownErrText } from "@/features/auth/clerk-errors";
import { signOutAndGo } from "@/features/auth/hard-navigate";
import { appRoutes } from "@/shared/constants/appRoutes";
import { LoadingState } from "@/shared/components/LoadingState";
import { AUTH_CONTROL_CLASS } from "@/features/auth/components/AuthField";
import { ApiRequestError } from "@/shared/services/apiClient";
import { getAccountDeletionStatus, settingsError, deleteMyAccount, type AccountDeletionStatus } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsCard, SettingsMark, SettingsStack } from "./SettingsCard";
import { TypeToConfirmLabel } from "./TypeToConfirmLabel";
import { useClerkAccount } from "./useClerkAccount";
import { passwordLengthHint, passwordLengthPlaceholder } from "@/features/auth/password";

type DeviceKind = "laptop" | "phone" | "tablet";

type SessionRow = {
  id: string;
  current: boolean;
  os: string;
  browser: string;
  detail: string;
  when: string;
  lastActiveAt: number;
  device: DeviceKind;
  revoke: () => Promise<unknown>;
};

function deviceKind(activity: { isMobile?: boolean; deviceType?: string } | null | undefined): DeviceKind {
  const type = activity?.deviceType?.toLowerCase() ?? "";
  if (type.includes("ipad") || type.includes("tablet")) return "tablet";
  if (activity?.isMobile || type.includes("phone") || type.includes("android")) return "phone";
  return "laptop";
}

function SessionDeviceImage({ kind }: { kind: DeviceKind }) {
  const label = kind === "phone" ? "Phone" : kind === "tablet" ? "Tablet" : "Laptop";
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500" aria-label={label}>
      <svg viewBox="0 0 32 32" className="size-7" fill="none" aria-hidden>
        {kind === "phone" ? (
          <>
            <rect x="10" y="3" width="12" height="26" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="16" cy="25.5" r="0.9" fill="currentColor" />
            <path d="M14 6.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : kind === "tablet" ? (
          <>
            <rect x="7" y="4" width="18" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="16" cy="24.5" r="0.9" fill="currentColor" />
          </>
        ) : (
          <>
            <rect x="5" y="6" width="22" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 22.5h26c.3 0 .5.2.5.5v1c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1v-1c0-.3.2-.5.5-.5Z" fill="currentColor" opacity="0.35" />
            <path d="M3 22.5h26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

function asDate(value: Date | string | number | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWhen(value: Date | string | number | null | undefined) {
  const date = asDate(value);
  if (!date) return "";
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatOs(activity: { deviceType?: string; isMobile?: boolean } | null | undefined) {
  if (activity?.deviceType) return activity.deviceType;
  return activity?.isMobile ? "Phone" : "Computer";
}

function formatBrowser(activity: { browserName?: string; browserVersion?: string } | null | undefined) {
  return [activity?.browserName, activity?.browserVersion].filter(Boolean).join(" ");
}

function formatDetail(activity: { ipAddress?: string; city?: string; country?: string } | null | undefined) {
  const ip = activity?.ipAddress;
  const shortIp = ip && ip.length > 18 ? `${ip.slice(0, 14)}...` : ip;
  const place = [activity?.city, activity?.country].filter(Boolean).join(", ");
  if (shortIp && place) return `${shortIp} (${place})`;
  return shortIp || (place ? `(${place})` : "");
}

export function AccountSecurityCard() {
  const { clerk, user, loaded, refresh } = useClerkAccount();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletion, setDeletion] = useState<AccountDeletionStatus>({ kind: "free" });

  const lastAdmin = deletion.kind === "last-admin";
  const ready = loaded && Boolean(user);
  const currentSessionId = clerk.session?.id;

  useEffect(() => {
    let cancelled = false;
    getAccountDeletionStatus()
      .then((next) => {
        if (!cancelled) setDeletion(next);
      })
      .catch(() => {
        if (!cancelled) setDeletion({ kind: "free" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user
      .getSessions()
      .then((list) => {
        if (cancelled) return;
        setSessions(
          list
            .map((session) => {
              const activity = session.latestActivity;
              return {
                id: session.id,
                current: session.id === currentSessionId,
                os: formatOs(activity),
                browser: formatBrowser(activity),
                detail: formatDetail(activity),
                when: formatWhen(session.lastActiveAt),
                lastActiveAt: asDate(session.lastActiveAt)?.getTime() ?? 0,
                device: deviceKind(activity),
                revoke: () => session.revoke(),
              };
            })
            .sort((a, b) => {
              if (a.current !== b.current) return a.current ? -1 : 1;
              return b.lastActiveAt - a.lastActiveAt;
            }),
        );
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, currentSessionId]);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setPasswordError(null);
    setBusy(true);
    try {
      await user.updatePassword({
        currentPassword: user.passwordEnabled ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      await refresh();
    } catch (err) {
      setPasswordError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(row: SessionRow) {
    if (row.current) return;
    setSecurityError(null);
    try {
      await row.revoke();
      setSessions((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setSecurityError(thrownErrText(err));
    }
  }

  async function revokeAllOther() {
    const others = sessions.filter((row) => !row.current);
    if (others.length === 0) return;
    setRevokeAllOpen(false);
    setSecurityError(null);
    setBusy(true);
    try {
      await Promise.all(others.map((row) => row.revoke()));
      setSessions((prev) => prev.filter((row) => row.current));
    } catch (err) {
      setSecurityError(thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  function closeDelete() {
    setDeleteConfirm(false);
    setConfirmName("");
  }

  async function deleteAccount() {
    if (!user) return;
    setSecurityError(null);
    setBusy(true);
    try {
      await deleteMyAccount(lastAdmin ? { confirm_name: confirmName } : undefined);
      await signOutAndGo(clerk, appRoutes.login);
    } catch (err) {
      const field = err instanceof ApiRequestError ? err.details?.field : undefined;
      if (!lastAdmin && field === "confirmName") {
        setSecurityError("You are now the only owner of this company. Reload the page to continue.");
        return;
      }
      setSecurityError(err instanceof ApiRequestError ? settingsError(err) : thrownErrText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <LoadingState label="Loading security" />;

  return (
    <SettingsStack>
      {securityError ? <p className="text-sm text-red-600">{securityError}</p> : null}

      <form onSubmit={(event) => void savePassword(event)}>
        <SettingsCard
          title="Password"
          description={user?.passwordEnabled ? "Choose a new password for this account." : "Add a password so you can sign in with email."}
          footerHint={passwordLengthHint()}
          footer={
            <Button
              type="submit"
              className="rounded-xl"
              disabled={!ready || busy || !newPassword || (Boolean(user?.passwordEnabled) && !currentPassword)}
              pending={busy}
            >
              {busy ? "Updating…" : user?.passwordEnabled ? "Save" : "Set password"}
            </Button>
          }
        >
          {passwordError ? <p className="mb-3 text-sm text-red-600">{passwordError}</p> : null}
          <div className="flex flex-col gap-4">
            {user?.passwordEnabled ? (
              <AuthField
                id="acct-current-password"
                label="Current password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                disabled={!ready || busy}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            ) : null}
            <AuthField
              id="acct-new-password"
              label={user?.passwordEnabled ? "New password" : "Password"}
              type="password"
              autoComplete="new-password"
              required
              placeholder={passwordLengthPlaceholder()}
              value={newPassword}
              disabled={!ready || busy}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
        </SettingsCard>
      </form>

      <SettingsCard
        title="Devices"
        description="Sessions signed in to this account."
        contentClassName={sessions.length > 0 ? "px-0 pb-0 pt-2" : undefined}
        footerHint="Sign out a device if you no longer recognise it."
        footer={
          sessions.some((row) => !row.current) ? (
            <Button type="button" variant="danger" className="rounded-xl" disabled={busy} onClick={() => setRevokeAllOpen(true)}>
              Revoke all other devices
            </Button>
          ) : undefined
        }
      >
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No devices to show.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-6 py-4">
                <SessionDeviceImage kind={row.device} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-950">{row.os}</p>
                    {row.current ? (
                      <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Active</span>
                    ) : null}
                  </div>
                  {row.browser ? <p className="text-xs text-slate-500">{row.browser}</p> : null}
                  {row.detail ? <p className="text-xs text-slate-500">{row.detail}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {row.when ? <p className="text-xs text-slate-500">{row.when}</p> : null}
                  {!row.current ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revokeSession(row)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                    >
                      Sign out
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {user?.deleteSelfEnabled === false ? null : lastAdmin && deletion.kind === "last-admin" ? (
        <SettingsCard
          title="Delete account"
          description={
            <>
              You're the only owner of <SettingsMark>{deletion.company_name}</SettingsMark>.{" "}
              <SettingsMark>Transfer ownership</SettingsMark> first if you want the company to stay.
            </>
          }
          footerHint={
            deleteConfirm ? (
              <>
                This <SettingsMark>cannot be undone</SettingsMark>.
              </>
            ) : deletion.other_members > 0 ? (
              <>
                Deleting anyway also deletes <SettingsMark>the company</SettingsMark> and{" "}
                <SettingsMark>every project</SettingsMark>. The other{" "}
                <SettingsMark>
                  {deletion.other_members} {deletion.other_members === 1 ? "person keeps their account" : "people keep their accounts"}
                </SettingsMark>
                , without a role, until someone invites them again.
              </>
            ) : (
              <>
                Deleting anyway also deletes <SettingsMark>the company</SettingsMark> and{" "}
                <SettingsMark>every project</SettingsMark>.
              </>
            )
          }
          footer={
            deleteConfirm ? (
              <>
                <Button
                  type="button"
                  variant="danger"
                  className="rounded-xl whitespace-nowrap"
                  disabled={busy || confirmName.trim().toLowerCase() !== deletion.company_name.trim().toLowerCase()}
                  pending={busy}
                  onClick={() => void deleteAccount()}
                >
                  Delete company and account
                </Button>
                <Button type="button" variant="ghost" className="rounded-xl" disabled={busy} onClick={closeDelete}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={appRoutes.organizationMembers}
                  className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Transfer ownership
                </Link>
                <Button type="button" variant="danger" className="h-9 rounded-xl whitespace-nowrap" onClick={() => setDeleteConfirm(true)}>
                  Delete anyway
                </Button>
              </>
            )
          }
        >
          {deleteConfirm ? (
            <div className="flex flex-col gap-2">
              <TypeToConfirmLabel htmlFor="delete-confirm-name" value={deletion.company_name} />
              <input
                id="delete-confirm-name"
                autoComplete="off"
                value={confirmName}
                disabled={busy}
                onChange={(event) => setConfirmName(event.target.value)}
                className={AUTH_CONTROL_CLASS}
              />
            </div>
          ) : null}
        </SettingsCard>
      ) : (
        <SettingsCard
          title="Delete account"
          description={
            <>
              This permanently removes you from <SettingsMark>Quanto</SettingsMark>.
            </>
          }
          footerHint={
            <>
              This <SettingsMark>cannot be undone</SettingsMark>.
            </>
          }
          footer={
            deleteConfirm ? (
              <>
                <Button type="button" variant="danger" className="rounded-xl whitespace-nowrap" disabled={busy} pending={busy} onClick={() => void deleteAccount()}>
                  Yes, delete my account
                </Button>
                <Button type="button" variant="ghost" className="rounded-xl" disabled={busy} onClick={closeDelete}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" variant="danger" className="rounded-xl" onClick={() => setDeleteConfirm(true)}>
                Delete account
              </Button>
            )
          }
        />
      )}

      <SecuredByClerk />
      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title="Sign out other devices"
        description="This device stays signed in. Every other session is signed out."
        confirmLabel="Sign out others"
        pending={busy}
        onConfirm={() => {
          void revokeAllOther();
        }}
      />
    </SettingsStack>
  );
}
