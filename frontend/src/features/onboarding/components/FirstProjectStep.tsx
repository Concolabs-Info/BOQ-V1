"use client";

import { useState } from "react";
import { AUTH_CONTROL_CLASS, AuthField } from "@/features/auth/components/AuthField";
import { Button } from "@/shared/components/Button";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingProject } from "../api";
import type { CreatedProject } from "../types";
import { FieldError, FieldLabel } from "./formBits";

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
      setNameError("Project name is required.");
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
            : "Something went wrong. Please try again.",
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
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField
          id="project-name"
          label="Project name"
          required
          value={name}
          placeholder="e.g. Riverside Tower"
          maxLength={160}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
          error={nameError ?? undefined}
        />
        <AuthField
          id="project-number"
          label="Project number"
          value={projectNumber}
          placeholder="Optional"
          maxLength={80}
          onChange={(event) => setProjectNumber(event.target.value)}
        />
        <AuthField
          id="project-client"
          label="Client"
          value={clientName}
          placeholder="Optional"
          maxLength={160}
          onChange={(event) => setClientName(event.target.value)}
        />
        <AuthField
          id="project-location"
          label="Location"
          value={location}
          placeholder="Optional"
          maxLength={240}
          onChange={(event) => setLocation(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="project-description">Description</FieldLabel>
        <textarea
          id="project-description"
          value={description}
          maxLength={2000}
          rows={4}
          placeholder="Optional"
          onChange={(event) => setDescription(event.target.value)}
          className={`${AUTH_CONTROL_CLASS} h-auto py-3`}
        />
      </div>
      <FieldError message={error ?? undefined} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" pending={pending} disabled={!name.trim()} className="h-11 rounded-xl sm:flex-1">
          {pending ? "Creating…" : "Create project"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="h-11 rounded-xl"
          onClick={onSkip}
        >
          Skip for now
        </Button>
      </div>
    </form>
  );
}
