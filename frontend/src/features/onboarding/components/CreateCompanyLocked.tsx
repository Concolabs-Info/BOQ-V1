"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingCompany } from "../api";
import { currencyForCountry } from "../countries";
import { CountrySelect } from "./CountrySelect";
import { FieldError, FieldLabel } from "./formBits";

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
      <div>
        <FieldLabel htmlFor="company-name" required>
          Company name
        </FieldLabel>
        <input
          id="company-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        />
        <FieldError message={errors.name} />
      </div>

      <div>
        <FieldLabel htmlFor="country" required>
          Country
        </FieldLabel>
        <CountrySelect id="country" value={country} onChange={setCountry} />
        <p className="mt-2 text-xs text-slate-500">Currency: {currencyForCountry(country)}</p>
      </div>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <Button type="submit" disabled={pending} className="h-11 rounded-xl">
        {pending ? "Creating…" : "Create company"}
      </Button>
    </form>
  );
}
