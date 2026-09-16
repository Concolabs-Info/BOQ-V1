"use client";

import { useState } from "react";
import { AuthField } from "@/features/auth/components/AuthField";
import { Button } from "@/shared/components/Button";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingCompany } from "../api";
import { currencyForCountry } from "../countries";
import { CountrySelect } from "./CountrySelect";

export function CreateCompanyLocked({
  suggestedName,
  onCreated,
}: {
  suggestedName: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [country, setCountry] = useState("Sri Lanka");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await createOnboardingCompany({ name, country, lock_domain: true });
      onCreated();
    } catch (error) {
      if (error instanceof ApiRequestError && error.details?.field) {
        setErrors({ [error.details.field]: error.rawMessage || error.message });
      } else {
        setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <AuthField
        id="company-name"
        label="Company name"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        error={errors.name}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="country" className="flex items-center gap-1 text-sm font-medium text-slate-950">
          Country
          <span className="text-red-600">*</span>
        </label>
        <CountrySelect id="country" value={country} onChange={setCountry} />
        <p className="text-xs text-slate-500">Currency: {currencyForCountry(country)}</p>
      </div>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl">
        {pending ? "Creating…" : "Create company"}
      </Button>
    </form>
  );
}
