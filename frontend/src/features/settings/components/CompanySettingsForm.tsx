"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { CountrySelect } from "@/features/onboarding/components/CountrySelect";
import { FieldLabel } from "@/features/onboarding/components/formBits";
import { currencyForCountry } from "@/features/onboarding/countries";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { getCompanySettings, settingsError, updateCompanySettings, type CompanySettings } from "../api";
import { SettingsCard, SettingsStack } from "./SettingsCard";

export function CompanySettingsForm() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Sri Lanka");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getCompanySettings(), getPlatformContext()])
      .then(([next, context]) => {
        if (!mounted) return;
        setCompany(next);
        setName(next.name);
        setCountry(next.country || "Sri Lanka");
        setTaxId(next.tax_id || "");
        setPhone(next.phone || "");
        setCanManage(context.permissions.includes("company:manage"));
      })
      .catch((nextError) => {
        if (mounted) setError(settingsError(nextError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const next = await updateCompanySettings({
        name,
        country,
        tax_id: taxId || null,
        phone: phone || null,
      });
      setCompany(next);
      setNote("Company details saved.");
    } catch (nextError) {
      setError(settingsError(nextError));
    } finally {
      setPending(false);
    }
  }

  if (loading) return <LoadingState label="Loading company" />;
  if (!company && error) return <ErrorMessage message={error} />;
  if (!company) return <ErrorMessage message="Company details could not be loaded." />;

  const disabled = !canManage || pending;

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
      {error ? <ErrorMessage message={error} /> : null}
      {note ? <p className="text-sm font-medium text-emerald-700">{note}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">Ask an admin to change company details.</p> : null}

      <SettingsStack>
        <SettingsCard
          title="Company name"
          description="The name people see on Clerk invitations, the sidebar, and exports."
          footerHint="Use the trading name your drawings are issued under."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          <FieldLabel htmlFor="co-name" required>
            Name
          </FieldLabel>
          <input
            id="co-name"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </SettingsCard>

        <SettingsCard
          title="Country"
          description="Sets the default currency for rates and BOQ export."
          footerHint={`Currency: ${currencyForCountry(country)}`}
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          <FieldLabel htmlFor="co-country" required>
            Country
          </FieldLabel>
          <CountrySelect id="co-country" value={country} disabled={disabled} onChange={setCountry} />
        </SettingsCard>

        <SettingsCard title="Registration" description="How the company was registered during onboarding.">
          <p className="text-sm text-slate-700">
            {company.registration_type === "PV"
              ? "Private limited (PV)"
              : company.registration_type === "BR"
                ? "Business registration (BR)"
                : "Not registered yet"}
            {company.registration_number ? ` · ${company.registration_number}` : ""}
          </p>
          {company.domain ? <p className="mt-2 text-sm text-slate-500">Work email domain: {company.domain}</p> : null}
        </SettingsCard>

        <SettingsCard
          title="Tax number"
          description="TIN or VAT number used on invoices and BOQ cover sheets."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          <FieldLabel htmlFor="co-tax">TIN or VAT number</FieldLabel>
          <input
            id="co-tax"
            value={taxId}
            disabled={disabled}
            onChange={(event) => setTaxId(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </SettingsCard>

        <SettingsCard
          title="Phone"
          description="A number the team can reach the office on."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          <FieldLabel htmlFor="co-phone">Phone</FieldLabel>
          <input
            id="co-phone"
            value={phone}
            disabled={disabled}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </SettingsCard>
      </SettingsStack>
    </form>
  );
}
