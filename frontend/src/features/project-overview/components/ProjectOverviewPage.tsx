"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteProject, getProject, updateProject } from "@/features/projects/services/projectService";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ProjectResponse, ProjectStatus } from "@/shared/types/apiTypes";

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; dotClassName: string }> = [
  { value: "active", label: "Active", dotClassName: "bg-emerald-500" },
  { value: "on_hold", label: "On hold", dotClassName: "bg-amber-500" },
  { value: "completed", label: "Completed", dotClassName: "bg-blue-500" },
  { value: "archived", label: "Archived", dotClassName: "bg-slate-500" }
];

const STATUS_BADGE_STYLES: Record<ProjectStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600"
};

export function ProjectOverviewPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getProject(projectId)
      .then((nextProject) => {
        if (mounted) setProject(nextProject);
      })
      .catch((nextError) => {
        if (mounted) setError(nextError instanceof Error ? nextError.message : "Project could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, [projectId]);

  async function saveProject(nextSavedMessage = "Project details saved.") {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const saved = await updateProject(project.id, {
        name: project.name,
        project_number: project.project_number,
        client_name: project.client_name,
        location: project.location,
        description: project.description,
        status: project.status,
      });
      setProject(saved);
      setSavedMessage(nextSavedMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveProject();
  }

  async function confirmDeleteProject() {
    if (!project) return;
    setIsDeleting(true);
    setError(null);
    setSavedMessage(null);
    try {
      await deleteProject(project.id);
      router.push(appRoutes.projects);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project could not be deleted.");
      setIsDeleting(false);
    }
  }

  return (
    <PlatformShell title={project?.name || "Project"} eyebrow="Project Library" activeNavHref={appRoutes.projects}>
      {!project && !error ? <LoadingState label="Loading project" /> : null}
      {error ? <div className="mb-5"><ErrorMessage message={error} /></div> : null}
      {project ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="outline" className="h-10 w-full justify-start border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 sm:w-auto">
              <Link href={appRoutes.projects}>
                <ArrowLeft />
                Back to projects
              </Link>
            </Button>
            <Button asChild className="h-10 w-full px-4 sm:w-auto">
              <Link href={appRoutes.workflowUpload(project.id)}>Open PDF Generation</Link>
            </Button>
          </div>

          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
            <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Project name" value={project.name} onChange={(value) => setProject({ ...project, name: value })} required />
              <Field label="Project number" value={project.project_number || ""} onChange={(value) => setProject({ ...project, project_number: value || null })} />
              <Field label="Client" value={project.client_name || ""} onChange={(value) => setProject({ ...project, client_name: value || null })} />
              <Field label="Location" value={project.location || ""} onChange={(value) => setProject({ ...project, location: value || null })} />
            </div>
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">Description</span>
              <textarea
                value={project.description || ""}
                onChange={(event) => setProject({ ...project, description: event.target.value || null })}
                rows={5}
                maxLength={1000}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Update project details, then save changes.</p>
              <div className="flex items-center gap-3">
                {savedMessage ? <span className="text-sm font-medium text-emerald-700">{savedMessage}</span> : null}
                <Button disabled={isSaving || !project.name.trim()} className="h-10 px-6">
                  {isSaving ? "Saving" : "Save details"}
                </Button>
              </div>
            </div>
            </form>

            <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Project status</p>
                <Badge variant="outline" className={STATUS_BADGE_STYLES[project.status]}>
                  {statusLabel(project.status)}
                </Badge>
              </div>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-700">Change status</span>
                <Select
                  value={project.status}
                  disabled={isSaving || isDeleting}
                  onValueChange={(value) => setProject({ ...project, status: value as ProjectStatus })}
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
              <p className="mt-3 text-xs leading-5 text-slate-500">Choose the project lifecycle status and save it here.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-10 w-full"
                disabled={isSaving || isDeleting || !project.name.trim()}
                onClick={() => void saveProject("Project status saved.")}
              >
                {isSaving ? "Saving" : "Save status"}
              </Button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Description</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {project.description || "No project description has been added yet."}
              </p>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">PDF Generation</p>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">Project workspace</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Open the current AutoBOQ workflow foundation for this project.</p>
              <Link
                href={appRoutes.workflowUpload(project.id)}
                className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open PDF Generation
              </Link>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ownership</p>
              <dl className="mt-4 space-y-3 text-sm">
                <Detail label="Organization" value={project.organization_name || "Workspace"} />
                <Detail label="Created" value={formatDate(project.created_at)} />
                <Detail label="Updated" value={formatDate(project.updated_at)} />
              </dl>
            </section>

            <section className="rounded-lg border border-red-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Danger zone</p>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">Delete project</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Permanently remove this project and its related project data.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-5 h-10 w-full"
                    disabled={isSaving || isDeleting}
                  >
                    Delete project
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete project?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes &quot;{project.name}&quot; and its related project data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                      onClick={(event) => {
                        event.preventDefault();
                        void confirmDeleteProject();
                      }}
                    >
                      {isDeleting ? "Deleting" : "Delete project"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
            </aside>
          </div>
        </div>
      ) : null}
    </PlatformShell>
  );
}

function statusLabel(status: ProjectStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status.replaceAll("_", " ");
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-3 h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}
