"use client";
import { FieldErrorText } from "@/shared/components/FieldErrorText";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingProject } from "../api";
import type { CreatedProject } from "../types";
import { onboarding3dButton } from "./onboardingButtonStyle";

function optional(value: string) {
  const cleaned = value.trim();
  return cleaned || undefined;
}

export function FirstProjectStep({
  onCreated,
  onSkip,
}: {
  onCreated: (project: CreatedProject) => void;
  onSkip: () => void;
}) {
  const t = useTranslations("onboarding.firstProject");
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const cleanName = name.trim();
    setError(null);
    if (!cleanName) {
      setNameError("Give the project a name to continue.");
      return;
    }
    setNameError(null);
    setPending(true);
    try {
      const created = await createOnboardingProject({
        name: cleanName,
        project_number: optional(projectNumber),
        client_name: optional(clientName),
        location: optional(location),
        description: optional(description),
      });
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.details?.field === "name") {
        setNameError(caught.rawMessage || caught.message);
      } else {
        setError(
          caught instanceof ApiRequestError
            ? caught.rawMessage || caught.message
            : "That didn't save. Mind trying again?",
        );
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(nameError)} className="!gap-1">
            <FieldLabel htmlFor="project-name" required>{t("projectName")}</FieldLabel>
            <Input
              id="project-name"
              required
              value={name}
              placeholder="e.g. Riverside Tower"
              maxLength={160}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
              aria-invalid={Boolean(nameError)}
              className="h-10"
            />
            <FieldErrorText>{nameError}</FieldErrorText>
          </Field>
          <Field className="!gap-1">
            <FieldLabel htmlFor="project-number">{t("projectNumber")}</FieldLabel>
            <Input
              id="project-number"
              value={projectNumber}
              placeholder={t("optional")}
              maxLength={80}
              onChange={(event) => setProjectNumber(event.target.value)}
              className="h-10"
            />
          </Field>
          <Field className="!gap-1">
            <FieldLabel htmlFor="project-client">{t("client")}</FieldLabel>
            <Input
              id="project-client"
              value={clientName}
              placeholder={t("optional")}
              maxLength={160}
              onChange={(event) => setClientName(event.target.value)}
              className="h-10"
            />
          </Field>
          <Field className="!gap-1">
            <FieldLabel htmlFor="project-location">{t("location")}</FieldLabel>
            <Input
              id="project-location"
              value={location}
              placeholder={t("optional")}
              maxLength={240}
              onChange={(event) => setLocation(event.target.value)}
              className="h-10"
            />
          </Field>
        </div>
        <Field className="!gap-1">
          <FieldLabel htmlFor="project-description">{t("description")}</FieldLabel>
          <textarea
            id="project-description"
            value={description}
            maxLength={2000}
            rows={3}
            placeholder={t("optional")}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
      </FieldGroup>
      <FieldErrorText>{error}</FieldErrorText>
      <div className="flex flex-col gap-3 sm:flex-row">
        <LoadingButton
          type="submit"
          pending={pending}
          disabled={!name.trim()}
          className={`h-11 w-full sm:flex-1 ${onboarding3dButton}`}
        >
          {pending ? t("creating") : t("createButton")}
        </LoadingButton>
        <Button type="button" variant="ghost" disabled={pending} onClick={onSkip} className="h-11 w-full sm:w-auto">
          {t("skip")}
        </Button>
      </div>
    </form>
  );
}
