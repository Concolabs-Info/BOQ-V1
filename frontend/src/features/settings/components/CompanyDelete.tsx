"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { AUTH_CONTROL_CLASS } from "@/features/auth/components/AuthField";
import { hardNavigate } from "@/features/auth/hard-navigate";
import { appRoutes } from "@/shared/constants/appRoutes";
import { deleteCompany, settingsError } from "../api";
import { SettingsCard } from "./SettingsCard";

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
      description="This permanently removes the company, every project, and all memberships and invites. Drawings and takeoff work for this company cannot be recovered."
      footerHint="This cannot be undone. You will set up a new company next."
      footer={
        <Button type="button" variant="danger" className="rounded-xl" disabled={!matches || pending} pending={pending} onClick={() => void submit()}>
          {pending ? "Deleting…" : "Delete company"}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="co-delete-confirm" required>
          Type {companyName} to confirm
        </FieldLabel>
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
