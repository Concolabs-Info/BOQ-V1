"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { CountrySelect } from "@/features/onboarding/components/CountrySelect";
import { useAssetUrl, invalidateAsset } from "@/features/floor-plans/hooks/useAssetUrl";
import { getPlatformContext, notifyCompanyLogoChanged } from "@/features/platform/services/platformService";
import {
  deleteCompanyLogo,
  getCompanySettings,
  settingsError,
  updateCompanySettings,
  uploadCompanyLogo,
  type CompanySettings,
} from "../api";
import { CompanyDeleteCard } from "./CompanyDelete";
import { SettingsCard, SettingsStack } from "./SettingsCard";

export function CompanySettingsForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Sri Lanka");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const logoSrc = useAssetUrl(localPhoto ? null : company?.logo_url);

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
        setCanDelete(context.permissions.includes("billing:manage"));
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
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "C";

  function applyCompany(next: CompanySettings) {
    const previous = company?.logo_url;
    if (previous && previous !== next.logo_url) {
      invalidateAsset(previous);
    }
    setCompany(next);
    notifyCompanyLogoChanged(next.logo_url);
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotoError(null);
    setPhotoPending(true);
    setLocalPhoto(preview);
    try {
      applyCompany(await uploadCompanyLogo(file));
    } catch (nextError) {
      setPhotoError(settingsError(nextError));
    } finally {
      URL.revokeObjectURL(preview);
      setLocalPhoto(null);
      setPhotoPending(false);
    }
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoPending(true);
    try {
      applyCompany(await deleteCompanyLogo());
    } catch (nextError) {
      setPhotoError(settingsError(nextError));
    } finally {
      setPhotoPending(false);
    }
  }

  let registrationLabel = "Not registered yet";
  if (company.registration_type === "PV") {
    registrationLabel = "Private limited (PV)";
  } else if (company.registration_type === "BR") {
    registrationLabel = "Business registration (BR)";
  }

  return (
    <SettingsStack>
      {error ? <ErrorMessage message={error} /> : null}
      {note ? <p className="text-sm font-medium text-emerald-700">{note}</p> : null}
      {!canManage ? (
        <p className="text-sm leading-6 text-slate-500">You can view these details. Ask an owner if something should change.</p>
      ) : null}

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          if (!canManage) {
            event.preventDefault();
            return;
          }
          void submit(event);
        }}
      >
        <SettingsCard
          title="Company photo"
          description="Shown on the sidebar in place of the default mark."
          footerHint={canManage ? "Square images work best. PNG, JPEG, or WebP, up to 5 MB." : undefined}
          footer={
            canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="rounded-xl" disabled={photoPending} pending={photoPending} onClick={() => fileRef.current?.click()}>
                  {company.logo_url ? "Update photo" : "Upload photo"}
                </Button>
                {company.logo_url ? (
                  <Button type="button" variant="danger" className="rounded-xl" disabled={photoPending} onClick={() => void removePhoto()}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
        >
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={!canManage || photoPending} onChange={(event) => void onPickPhoto(event)} />
          {photoError ? <p className="mb-3 text-sm text-red-600">{photoError}</p> : null}
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-base font-semibold text-slate-600">
              {localPhoto || logoSrc ? <img src={localPhoto || logoSrc || ""} alt="" className="size-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-950">{name || "Company"}</p>
              <p className="truncate text-xs text-slate-500">{company.logo_url ? "Used on the sidebar." : "No photo yet. The default mark is shown."}</p>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Company name"
          titleId="co-name-heading"
          description="The name people see on invitations, the sidebar, and exports."
          footerHint={canManage ? "Use the trading name your drawings are issued under." : undefined}
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          {canManage ? (
            <input
              id="co-name"
              required
              aria-labelledby="co-name-heading"
              value={name}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          ) : (
            <ReadValue>{name}</ReadValue>
          )}
        </SettingsCard>

        <SettingsCard
          title="Country"
          titleId="co-country-heading"
          description="Where the company is based."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          {canManage ? (
            <CountrySelect
              id="co-country"
              aria-labelledby="co-country-heading"
              value={country}
              disabled={disabled}
              onChange={setCountry}
            />
          ) : (
            <ReadValue>{country}</ReadValue>
          )}
        </SettingsCard>

        <SettingsCard title="Registration" description="How the company was registered during onboarding.">
          <p className="text-sm text-slate-700">
            {registrationLabel}
            {company.registration_number ? ` · ${company.registration_number}` : ""}
          </p>
          {company.domain ? <p className="mt-2 text-sm text-slate-500">Work email domain: {company.domain}</p> : null}
        </SettingsCard>

        <SettingsCard
          title="Tax number"
          titleId="co-tax-heading"
          description="TIN or VAT number used on invoices and BOQ cover sheets."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          {canManage ? (
            <input
              id="co-tax"
              aria-labelledby="co-tax-heading"
              value={taxId}
              disabled={disabled}
              onChange={(event) => setTaxId(event.target.value)}
              placeholder="TIN or VAT number"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          ) : (
            <ReadValue>{taxId}</ReadValue>
          )}
        </SettingsCard>

        <SettingsCard
          title="Phone"
          titleId="co-phone-heading"
          description="A number the team can reach the office on."
          footer={
            canManage ? (
              <Button type="submit" className="rounded-xl" disabled={disabled}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : undefined
          }
        >
          {canManage ? (
            <input
              id="co-phone"
              type="tel"
              aria-labelledby="co-phone-heading"
              value={phone}
              disabled={disabled}
              onChange={(event) => setPhone(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          ) : (
            <ReadValue>{phone}</ReadValue>
          )}
        </SettingsCard>
      </form>
      {canDelete ? <CompanyDeleteCard companyName={company.name} /> : null}
    </SettingsStack>
  );
}

function ReadValue({ children }: { children?: string | null }) {
  const value = (children || "").trim();
  if (!value) return <p className="text-sm leading-6 text-slate-500">Not set</p>;
  return <p className="text-sm leading-6 text-slate-950">{value}</p>;
}
