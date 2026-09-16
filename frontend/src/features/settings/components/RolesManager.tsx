"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { getPlatformContext } from "@/features/platform/services/platformService";
import {
  createCompanyRole,
  deleteCompanyRole,
  listCompanyRoles,
  settingsError,
  updateCompanyRole,
  type CompanyRole,
} from "../api";
import { CUSTOM_PERMISSION_GROUPS, PERMISSION_GROUPS, PERMISSION_MATRIX, ROLE_LABELS, ROLES } from "../rbac";
import { SettingsCard, SettingsStack } from "./SettingsCard";

export function RolesManager() {
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editor, setEditor] = useState<CompanyRole | "create" | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [payload, context] = await Promise.all([listCompanyRoles(), getPlatformContext()]);
    setRoles(payload.roles);
    setCanManage(context.permissions.includes("members:manage"));
  }

  useEffect(() => {
    let mounted = true;
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

  if (loading) return <LoadingState label="Loading roles" />;

  const builtIn = roles.filter((role) => role.built_in);
  const custom = roles.filter((role) => !role.built_in);

  return (
    <SettingsStack>
      {error ? <ErrorMessage message={error} /> : null}
      {note ? <p className="text-sm font-medium text-emerald-700">{note}</p> : null}

      <SettingsCard
        title="Built-in roles"
        description="These stay in Quanto’s database. Clerk is not used for roles."
        footerHint="Owner / Admin is a promotion from the members list, not an invite option."
      >
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {builtIn.map((role) => (
            <li key={role.key} className="px-5 py-4">
              <p className="text-sm font-semibold text-slate-950">{role.name}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{role.description}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
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
                    {ROLES.map((role) => (
                      <td key={role} className="px-2 py-2.5 text-center text-slate-500">
                        {PERMISSION_MATRIX[item.key]?.includes(role) ? "•" : ""}
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Custom roles"
        description="Create company-specific roles in Postgres. People get them when you invite or reassign them."
        action={
          canManage ? (
            <Button type="button" className="rounded-xl" onClick={() => setEditor("create")}>
              New role
            </Button>
          ) : undefined
        }
      >
        {custom.length === 0 ? (
          <p className="text-sm text-slate-500">No custom roles yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {custom.map((role) => (
              <li key={role.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{role.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{role.description || "Custom role"}</p>
                  <p className="mt-1 text-xs text-slate-400">{role.permissions.length} permissions</p>
                </div>
                {canManage ? (
                  <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setEditor(role)}>
                    Edit
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {editor ? (
        <RoleEditor
          role={editor === "create" ? null : editor}
          pending={busy}
          onClose={() => setEditor(null)}
          onSave={async (payload) => {
            setBusy(true);
            setError(null);
            setNote(null);
            try {
              if (editor === "create") {
                await createCompanyRole(payload);
                setNote("Role created.");
              } else {
                await updateCompanyRole(editor.id, payload);
                setNote("Role updated.");
              }
              await reload();
              setEditor(null);
            } catch (next) {
              setError(settingsError(next));
            } finally {
              setBusy(false);
            }
          }}
          onDelete={
            editor === "create"
              ? undefined
              : async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await deleteCompanyRole(editor.id);
                    setNote("Role deleted.");
                    await reload();
                    setEditor(null);
                  } catch (next) {
                    setError(settingsError(next));
                  } finally {
                    setBusy(false);
                  }
                }
          }
        />
      ) : null}
    </SettingsStack>
  );
}

function RoleEditor({
  role,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  role: CompanyRole | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; description?: string; permissions: string[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);

  function toggle(key: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, key] : current.filter((item) => item !== key)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({ name, description: description || undefined, permissions: selected });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4">
      <form
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
        onSubmit={submit}
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="text-lg font-semibold text-slate-950">{role ? "Edit role" : "New role"}</h3>
          <p className="mt-1 text-sm text-slate-500">Saved on this company in Postgres. Clerk is not involved.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <FieldLabel htmlFor="role-name" required>
              Name
            </FieldLabel>
            <input
              id="role-name"
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <FieldLabel htmlFor="role-description">Description</FieldLabel>
            <input
              id="role-description"
              value={description}
              disabled={pending}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="space-y-4">
            {CUSTOM_PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.title}>
                <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{group.title}</legend>
                <div className="mt-2 space-y-1">
                  {group.keys.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.key)}
                        disabled={pending}
                        onChange={(event) => toggle(item.key, event.target.checked)}
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-4">
          {onDelete ? (
            <Button type="button" variant="danger" className="h-11 rounded-xl" disabled={pending} onClick={() => void onDelete()}>
              Delete role
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="h-11 flex-1 rounded-xl" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-11 flex-1 rounded-xl" disabled={pending}>
              {pending ? "Saving…" : role ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
