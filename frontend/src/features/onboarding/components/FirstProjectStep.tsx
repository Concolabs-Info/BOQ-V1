"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { createOnboardingProject } from "../api";
import { FieldError, FieldLabel } from "./formBits";

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
      <div>
        <FieldLabel htmlFor="workspace-name" required>
          Project workspace name
        </FieldLabel>
        <input
          id="workspace-name"
          value={name}
          placeholder="e.g. Riverside Tower"
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
        />
        <FieldError message={error ?? undefined} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending} className="h-11 rounded-xl">
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
