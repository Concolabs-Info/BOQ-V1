"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { FieldErrorText } from "@/shared/components/FieldErrorText";
import { ApiRequestError } from "@/shared/services/apiClient";
import { updateCompanySettings } from "@/features/settings/api";
import { createOnboardingCompany } from "../api";
import type { CreatedCompany } from "../types";
import { CountrySelect } from "./CountrySelect";
import { onboarding3dButton } from "./onboardingButtonStyle";
import { TermsConsentLine } from "./TermsConsentLine";

export function CreateCompanyLocked({
  name,
  country,
  existing,
  onNameChange,
  onCountryChange,
  onCreated,
}: {
  name: string;
  country: string;
  existing?: boolean;
  onNameChange: (name: string) => void;
  onCountryChange: (country: string) => void;
  onCreated: (company: CreatedCompany) => void;
}) {
  const t = useTranslations("onboarding.createCompanyLocked");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      if (existing) {
        const saved = await updateCompanySettings({ name, country });
        onCreated({ id: saved.id, name: saved.name, role: saved.role });
        return;
      }
      const created = await createOnboardingCompany({ name, country, lock_domain: true });
      onCreated(created);
    } catch (error) {
      if (error instanceof ApiRequestError && error.details?.field) {
        setErrors({ [error.details.field]: error.rawMessage || error.message });
      } else {
        setFormError(error instanceof Error ? error.message : "That didn't save. Mind trying again?");
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
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)} className="!gap-1">
          <FieldLabel htmlFor="company-name" required>{t("companyName")}</FieldLabel>
          <Input
            id="company-name"
            required
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
            aria-invalid={Boolean(errors.name)}
            className="h-10"
          />
          <FieldErrorText>{errors.name}</FieldErrorText>
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="country">{t("country")}</FieldLabel>
        <CountrySelect id="country" value={country} onChange={onCountryChange} />
      </div>

      <FieldErrorText>{formError}</FieldErrorText>

      <LoadingButton type="submit" pending={pending} className={`h-11 w-full ${onboarding3dButton}`}>
        {pending ? (existing ? t("saving") : t("creating")) : existing ? t("continueButton") : t("createButton")}
      </LoadingButton>
      {existing ? null : <TermsConsentLine action={t("consentAction")} />}
    </form>
  );
}
