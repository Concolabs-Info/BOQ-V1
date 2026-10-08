"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { deleteProject, getCachedProjects, listProjects, updateProject } from "@/features/projects/services/projectService";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ProjectListItem, ProjectListResponse, ProjectStatus } from "@/shared/types/apiTypes";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;
const ALL_PROJECTS_VALUE = "all";

const STATUS_OPTIONS: Array<{ value: typeof ALL_PROJECTS_VALUE | ProjectStatus; label: string; dotClassName: string }> = [
  { value: ALL_PROJECTS_VALUE, label: "All projects", dotClassName: "bg-slate-400" },
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

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: ProjectStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status.replaceAll("_", " ");
}

export default function ProjectsPage() {
  const [response, setResponse] = useState<ProjectListResponse>({ projects: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mutatingProjectId, setMutatingProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setOffset(0);
      setSearch((currentSearch) => currentSearch === nextSearch ? currentSearch : nextSearch);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let mounted = true;
    const canUseDefaultCache = !search && !status && offset === 0;
    const cached = canUseDefaultCache ? getCachedProjects() : null;
    if (cached) {
      setResponse(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError(null);
    listProjects({ search, status: status || undefined, limit: PAGE_SIZE, offset })
      .then((nextResponse) => {
        if (mounted) setResponse(nextResponse);
      })
      .catch((nextError) => {
        if (mounted) setError(nextError instanceof Error ? nextError.message : "Projects could not be loaded.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [offset, search, status]);

  const pageNumber = useMemo(() => Math.floor(response.offset / response.limit) + 1, [response.limit, response.offset]);
  const totalPages = Math.max(1, Math.ceil(response.total / response.limit));
  const showInitialSkeletons = isLoading && response.projects.length === 0;

  async function changeProjectStatus(project: ProjectListItem, nextStatus: ProjectStatus) {
    if (project.status === nextStatus) return;
    setMutatingProjectId(project.id);
    setError(null);
    try {
      const updated = await updateProject(project.id, { status: nextStatus });
      setResponse((current) => ({
        ...current,
        projects: current.projects.map((item) => item.id === updated.id ? { ...item, ...updated } : item)
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project status could not be updated.");
    } finally {
      setMutatingProjectId(null);
    }
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    setMutatingProjectId(deleteTarget.id);
    setError(null);
    try {
      await deleteProject(deleteTarget.id);
      setResponse((current) => ({
        ...current,
        projects: current.projects.filter((item) => item.id !== deleteTarget.id),
        total: Math.max(0, current.total - 1)
      }));
      setDeleteTarget(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project could not be deleted.");
    } finally {
      setMutatingProjectId(null);
    }
  }

  return (
    <PlatformShell title="Projects" eyebrow="Project Library" activeNavHref={appRoutes.projects}>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Project name, number, client or location"
                className="h-11 rounded-lg border-slate-200 bg-white pl-9 pr-9 shadow-sm focus-visible:ring-blue-200"
              />
              {searchInput ? (
                <button
                  type="button"
                  aria-label="Clear project search"
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </label>
          <label className="block sm:w-52">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
            <Select
              value={status || ALL_PROJECTS_VALUE}
              onValueChange={(value) => {
                setOffset(0);
                setStatus(value === ALL_PROJECTS_VALUE ? "" : value as ProjectStatus);
              }}
            >
              <SelectTrigger className="mt-2 h-11 rounded-lg border-slate-200 bg-white shadow-sm focus:ring-blue-200">
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
        <Button asChild className="h-10 w-full px-5 sm:w-auto">
          <Link href={appRoutes.createProject}>Create Project</Link>
        </Button>
      </div>

      {error ? <div className="mb-5"><ErrorMessage message={error} /></div> : null}

      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>{response.total} project{response.total === 1 ? "" : "s"}</span>
        {isLoading && response.projects.length > 0 ? <span>Updating</span> : null}
      </div>

      {showInitialSkeletons ? (
        <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <ProjectCardSkeleton key={index} />
          ))}
        </section>
      ) : null}

      {!isLoading && response.projects.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">No projects found</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            Adjust the search or create a new project.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href={appRoutes.createProject}>Create Project</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {!showInitialSkeletons && response.projects.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {response.projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isMutating={mutatingProjectId === project.id}
              onDelete={() => setDeleteTarget(project)}
              onStatusChange={(nextStatus) => void changeProjectStatus(project, nextStatus)}
            />
          ))}
        </section>
      ) : null}

      {response.total > PAGE_SIZE ? (
        <div className="mt-7 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Button
            type="button"
            variant="secondary"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="text-sm font-medium text-slate-600">Page {pageNumber} of {totalPages}</span>
          <Button
            type="button"
            variant="secondary"
            disabled={offset + PAGE_SIZE >= response.total || isLoading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      ) : null}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTarget?.name ? `"${deleteTarget.name}"` : "this project"} and its related project data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutatingProjectId === deleteTarget?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutatingProjectId === deleteTarget?.id}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteProject();
              }}
            >
              {mutatingProjectId === deleteTarget?.id ? "Deleting" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformShell>
  );
}

function ProjectCard({
  project,
  isMutating,
  onDelete,
  onStatusChange
}: {
  project: ProjectListItem;
  isMutating: boolean;
  onDelete: () => void;
  onStatusChange: (status: ProjectStatus) => void;
}) {
  return (
    <Card className="flex min-h-[250px] flex-col border-slate-200 bg-white transition-shadow hover:shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-lg leading-6 tracking-normal">
              <Link href={appRoutes.workspace(project.id)} className="block truncate text-slate-950 hover:text-blue-700">
                {project.name}
              </Link>
            </CardTitle>
            <p className="mt-1 truncate text-sm text-slate-500">{project.project_number || "No project number"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className={STATUS_BADGE_STYLES[project.status]}>
              {statusLabel(project.status)}
            </Badge>
            <ProjectCardActions project={project} disabled={isMutating} onDelete={onDelete} onStatusChange={onStatusChange} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <p className="mb-5 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-500">
          {project.description || "No project description added."}
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <ProjectDetail label="Client" value={project.client_name || "Not set"} />
          <ProjectDetail label="Location" value={project.location || "Not set"} />
          <ProjectDetail label="Organization" value={project.organization_name || "Workspace"} />
          <ProjectDetail label="Updated" value={formatDate(project.updated_at)} />
        </dl>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Link href={appRoutes.workspace(project.id)} className="text-sm font-semibold text-slate-700 hover:text-blue-700">
          Project details
        </Link>
        <Button asChild className="h-10 px-4">
          <Link href={appRoutes.workflowUpload(project.id)}>Continue Project</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProjectCardActions({
  project,
  disabled,
  onDelete,
  onStatusChange
}: {
  project: ProjectListItem;
  disabled: boolean;
  onDelete: () => void;
  onStatusChange: (status: ProjectStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-slate-500 hover:text-slate-900"
          disabled={disabled}
          aria-label={`Open actions for ${project.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Project actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={appRoutes.workspace(project.id)}>Edit details</Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {STATUS_OPTIONS.filter((option) => option.value !== ALL_PROJECTS_VALUE).map((option) => (
              <DropdownMenuItem
                key={option.value}
                disabled={project.status === option.value}
                onClick={() => onStatusChange(option.value as ProjectStatus)}
              >
                <span className={`mr-2 size-2 rounded-full ${option.dotClassName}`} />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600 focus:text-red-700" onClick={onDelete}>
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-slate-100 pt-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card className="min-h-[250px] border-slate-200 bg-white">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-lg" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="border-t border-slate-100 pt-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-4 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between border-t border-slate-100 pt-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </CardFooter>
    </Card>
  );
}
