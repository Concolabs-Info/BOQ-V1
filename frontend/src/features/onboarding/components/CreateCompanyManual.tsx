"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldErrorText } from "@/shared/components/FieldErrorText";
import { ApiRequestError } from "@/shared/services/apiClient";
import { updateCompanySettings } from "@/features/settings/api";
import { createOnboardingCompany } from "../api";
import type { CompanyDraft, CreatedCompany } from "../types";
import { CountrySelect } from "./CountrySelect";
import { onboarding3dButton } from "./onboardingButtonStyle";
import { TermsConsentLine } from "./TermsConsentLine";
import { useState } from "react";

const REG_PLACEHOLDER: Record<CompanyDraft["regKind"], string> = {
  PV: "PV 00123456",
  BR: "W/12/3456",
};

export function CreateCompanyManual({
  draft,
  existing,
  onDraftChange,
  onCreated,
}: {
  draft: CompanyDraft;
  existing?: boolean;
  onDraftChange: (patch: Partial<CompanyDraft>) => void;
  onCreated: (company: CreatedCompany) => void;
}) {
  const t = useTranslations("onboarding.createCompanyManual");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      if (existing) {
        const saved = await updateCompanySettings({ name: draft.name, country: draft.country });
        onCreated({ id: saved.id, name: saved.name, role: saved.role });
        return;
      }
      const created = await createOnboardingCompany({
        name: draft.name,
        country: draft.country,
        registration_type: draft.hasRegNumber ? draft.regKind : "NONE",
        registration_number: draft.hasRegNumber ? draft.regNumber : undefined,
      });
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
            value={draft.name}
            onChange={(event) => onDraftChange({ name: event.target.value })}
            autoFocus
            aria-invalid={Boolean(errors.name)}
            className="h-10"
          />
          <FieldErrorText>{errors.name}</FieldErrorText>
        </Field>
      </FieldGroup>

      {existing ? null : (
        <div className="flex flex-col gap-3 rounded-lg border border-input px-3 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium text-foreground">{t("hasRegNumber")}</span>
              <span className="block text-xs text-muted-foreground">{t("hasRegNumberHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={draft.hasRegNumber}
              onChange={(event) => onDraftChange({ hasRegNumber: event.target.checked })}
              className="size-4 shrink-0 accent-primary"
            />
          </label>

          <AnimatePresence initial={false}>
            {draft.hasRegNumber ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="-m-1 overflow-hidden p-1"
              >
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <Select value={draft.regKind} onValueChange={(next) => onDraftChange({ regKind: next as CompanyDraft["regKind"] })}>
                    <SelectTrigger className="w-full sm:w-40 sm:shrink-0">
                      <SelectValue>{draft.regKind === "PV" ? "PV number" : "BR number"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PV">PV number</SelectItem>
                      <SelectItem value="BR">BR number</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Input
                      id="reg-number"
                      required
                      value={draft.regNumber}
                      placeholder={REG_PLACEHOLDER[draft.regKind]}
                      onChange={(event) => onDraftChange({ regNumber: event.target.value })}
                      aria-invalid={Boolean(errors.registrationNumber)}
                      className="h-10"
                    />
                    <FieldErrorText>{errors.registrationNumber}</FieldErrorText>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="country">{t("country")}</FieldLabel>
        <CountrySelect id="country" value={draft.country} onChange={(country) => onDraftChange({ country })} />
      </div>

      <FieldErrorText>{formError}</FieldErrorText>

      <LoadingButton type="submit" pending={pending} className={`h-11 w-full ${onboarding3dButton}`}>
        {pending ? (existing ? t("saving") : t("creating")) : existing ? t("continueButton") : t("createButton")}
      </LoadingButton>
      {existing ? null : <TermsConsentLine action={t("consentAction")} />}
    </form>
  );
}
