"use client";

import { useState } from "react";
import { AuthField } from "@/features/auth/components/AuthField";
import { Button } from "@/shared/components/Button";
import { ApiRequestError } from "@/shared/services/apiClient";
import { cn } from "@/shared/lib/cn";
import { createOnboardingCompany } from "../api";
import { currencyForCountry } from "../countries";
import { CountrySelect } from "./CountrySelect";
import { FieldError } from "./formBits";

type RegType = "PV" | "BR" | "NONE";

const REG_OPTIONS: { value: RegType; label: string; placeholder?: string }[] = [
  { value: "PV", label: "Private company (PV number)", placeholder: "PV 00123456" },
  { value: "BR", label: "Business name (BR number)", placeholder: "W/12/3456" },
  { value: "NONE", label: "Not registered yet / registered outside Sri Lanka" },
];

export function CreateCompanyManual({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [regType, setRegType] = useState<RegType | "">("");
  const [regNumber, setRegNumber] = useState("");
  const [country, setCountry] = useState("Sri Lanka");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const showNumber = regType === "PV" || regType === "BR";
  const placeholder = REG_OPTIONS.find((option) => option.value === regType)?.placeholder;

  async function submit() {
    setErrors({});
    setFormError(null);
    if (!regType) {
      setErrors({ regType: "Choose one." });
      return;
    }
    setPending(true);
    try {
      await createOnboardingCompany({
        name,
        country,
        registration_type: regType,
        registration_number: showNumber ? regNumber : undefined,
      });
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-950">
          Registration type
          <span className="text-red-600">*</span>
        </legend>
        {REG_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
              regType === option.value ? "border-blue-600 bg-blue-50 text-slate-950" : "border-slate-200 text-slate-700",
            )}
          >
            <input
              type="radio"
              name="regType"
              value={option.value}
              checked={regType === option.value}
              onChange={() => setRegType(option.value)}
              className="accent-blue-600"
            />
            {option.label}
          </label>
        ))}
        <FieldError message={errors.regType} />
      </fieldset>

      {showNumber ? (
        <AuthField
          id="reg-number"
          label="Registration number"
          required
          value={regNumber}
          placeholder={placeholder}
          onChange={(event) => setRegNumber(event.target.value)}
          error={errors.registrationNumber}
        />
      ) : null}

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
