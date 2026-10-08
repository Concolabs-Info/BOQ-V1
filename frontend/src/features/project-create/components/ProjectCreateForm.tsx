"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/features/projects/services/projectService";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ProjectStatus } from "@/shared/types/apiTypes";

const DESCRIPTION_MAX_LENGTH = 1000;
const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; dotClassName: string }> = [
  { value: "active", label: "Active", dotClassName: "bg-emerald-500" },
  { value: "on_hold", label: "On hold", dotClassName: "bg-amber-500" },
  { value: "completed", label: "Completed", dotClassName: "bg-blue-500" },
  { value: "archived", label: "Archived", dotClassName: "bg-slate-500" }
];

export function ProjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Project name is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const project = await createProject({
        name: cleanName,
        project_number: projectNumber.trim() || null,
        client_name: clientName.trim() || null,
        location: location.trim() || null,
        description: description.trim() || null,
        status,
      });
      router.push(appRoutes.workspace(project.project_id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl pt-2 sm:pt-6">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl tracking-normal text-slate-950">Project details</CardTitle>
          <CardDescription>
            Create a project workspace for drawings, takeoff, BOQ and rate files.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Project name" value={name} onChange={setName} required autoFocus maxLength={120} disabled={isSaving} />
              <Field label="Project number" value={projectNumber} onChange={setProjectNumber} maxLength={80} disabled={isSaving} />
              <Field label="Client" value={clientName} onChange={setClientName} maxLength={120} disabled={isSaving} />
              <Field label="Location" value={location} onChange={setLocation} maxLength={160} disabled={isSaving} />
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Status</span>
                <Select
                  value={status}
                  disabled={isSaving}
                  onValueChange={(value) => setStatus(value as ProjectStatus)}
                >
                  <SelectTrigger className="mt-3 h-11 rounded-lg border-slate-200 bg-white shadow-sm focus:ring-blue-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${option.dotClassName}`} />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="block">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Description</span>
                <span className="text-xs text-slate-400">
                  {description.length} / {DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={DESCRIPTION_MAX_LENGTH}
                rows={4}
                disabled={isSaving}
                className="mt-3 resize-none rounded-lg border-slate-200 bg-white focus-visible:ring-blue-200"
              />
            </label>
            {error ? <ErrorMessage message={error} /> : null}
          </CardContent>
          <CardFooter className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full px-6 sm:w-auto"
              onClick={() => router.push(appRoutes.projects)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button disabled={isSaving || !name.trim()} className="h-10 w-full px-6 sm:w-auto">
              {isSaving ? "Creating..." : "Create project"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  autoFocus = false,
  maxLength,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-xs font-medium text-blue-600">Required</span> : null}
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        autoFocus={autoFocus}
        maxLength={maxLength}
        disabled={disabled}
        className="mt-3 h-11 rounded-lg border-slate-200 bg-white focus-visible:ring-blue-200"
      />
    </label>
  );
}
