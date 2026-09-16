"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthField } from "@/features/auth/components/AuthField";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingProject } from "../api";

export function FirstProjectStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    try {
      await createOnboardingProject({ name });
      router.replace(appRoutes.projects);
    } catch (caught) {
      const message =
        caught instanceof ApiRequestError
          ? caught.rawMessage || caught.message
          : "Something went wrong. Please try again.";
      setError(message);
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
        id="workspace-name"
        label="Project workspace name"
        required
        value={name}
        placeholder="e.g. Riverside Tower"
        onChange={(event) => setName(event.target.value)}
        autoFocus
        error={error ?? undefined}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending} className="h-11 rounded-xl sm:flex-1">
          {pending ? "Creating…" : "Create project workspace"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="h-11 rounded-xl"
          onClick={() => router.replace(appRoutes.projects)}
        >
          Skip for now
        </Button>
      </div>
    </form>
  );
}
