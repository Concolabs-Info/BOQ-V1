"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { AUTH_CONTROL_CLASS } from "@/features/auth/components/AuthField";
import { hardNavigate } from "@/features/auth/hard-navigate";
import { appRoutes } from "@/shared/constants/appRoutes";
import { deleteCompany, settingsError } from "../api";
import { SettingsCard, SettingsMark } from "./SettingsCard";
import { TypeToConfirmLabel } from "./TypeToConfirmLabel";

export function CompanyDeleteCard({ companyName }: { companyName: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const matches = typed.trim().toLowerCase() === companyName.trim().toLowerCase();

  async function submit() {
    setError(null);
    setPending(true);
    try {
      await deleteCompany({ confirm_name: typed });
      hardNavigate(`${appRoutes.onboarding}?after=deleted`);
    } catch (next) {
      setError(settingsError(next));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="Delete company"
      description={
        <>
          This permanently removes <SettingsMark>the company</SettingsMark>,{" "}
          <SettingsMark>every project</SettingsMark>, and all memberships and invites. Drawings and takeoff work for this
          company <SettingsMark>cannot be recovered</SettingsMark>. Other members keep their Quanto accounts, without a
          role, and can be invited to a new company.
        </>
      }
      footerHint={
        <>
          This <SettingsMark>cannot be undone</SettingsMark>. You will set up a new company next.
        </>
      }
      footer={
        <Button type="button" variant="danger" className="rounded-xl" disabled={!matches || pending} pending={pending} onClick={() => void submit()}>
          {pending ? "Deleting…" : "Delete company"}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <TypeToConfirmLabel htmlFor="co-delete-confirm" value={companyName} required />
        <input
          id="co-delete-confirm"
          value={typed}
          disabled={pending}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
          className={AUTH_CONTROL_CLASS}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </SettingsCard>
  );
}
