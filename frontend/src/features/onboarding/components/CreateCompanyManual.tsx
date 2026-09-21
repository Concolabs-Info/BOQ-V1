"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldErrorText } from "@/shared/components/FieldErrorText";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingCompany } from "../api";
import { currencyForCountry } from "../countries";
import type { CreatedCompany } from "../types";
import { CountrySelect } from "./CountrySelect";
import { onboarding3dButton } from "./onboardingButtonStyle";
import { TermsConsentLine } from "./TermsConsentLine";

type RegKind = "PV" | "BR";

const REG_PLACEHOLDER: Record<RegKind, string> = {
  PV: "PV 00123456",
  BR: "W/12/3456",
};

export function CreateCompanyManual({ onCreated }: { onCreated: (company: CreatedCompany) => void }) {
  const t = useTranslations("onboarding.createCompanyManual");
  const [name, setName] = useState("");
  const [hasRegNumber, setHasRegNumber] = useState(false);
  const [regKind, setRegKind] = useState<RegKind>("PV");
  const [regNumber, setRegNumber] = useState("");
  const [country, setCountry] = useState("Sri Lanka");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const created = await createOnboardingCompany({
        name,
        country,
        registration_type: hasRegNumber ? regKind : "NONE",
        registration_number: hasRegNumber ? regNumber : undefined,
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
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            aria-invalid={Boolean(errors.name)}
            className="h-10"
          />
          <FieldErrorText>{errors.name}</FieldErrorText>
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3 rounded-lg border border-input px-3 py-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium text-foreground">{t("hasRegNumber")}</span>
            <span className="block text-xs text-muted-foreground">{t("hasRegNumberHint")}</span>
          </span>
          <input
            type="checkbox"
            checked={hasRegNumber}
            onChange={(event) => setHasRegNumber(event.target.checked)}
            className="size-4 shrink-0 accent-primary"
          />
        </label>

        <AnimatePresence initial={false}>
          {hasRegNumber ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="-m-1 overflow-hidden p-1"
            >
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Select value={regKind} onValueChange={(next) => setRegKind(next as RegKind)}>
                  <SelectTrigger className="sm:w-40 sm:shrink-0">
                    <SelectValue>{regKind === "PV" ? "PV number" : "BR number"}</SelectValue>
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
                    value={regNumber}
                    placeholder={REG_PLACEHOLDER[regKind]}
                    onChange={(event) => setRegNumber(event.target.value)}
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

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="country">{t("country")}</FieldLabel>
        <CountrySelect id="country" value={country} onChange={setCountry} />
        <p className="text-xs text-muted-foreground">{t("currency", { currency: currencyForCountry(country) })}</p>
      </div>

      <FieldErrorText>{formError}</FieldErrorText>

      <LoadingButton type="submit" pending={pending} className={`h-11 w-full ${onboarding3dButton}`}>
        {pending ? t("creating") : t("createButton")}
      </LoadingButton>
      <TermsConsentLine action={t("consentAction")} />
    </form>
  );
}
