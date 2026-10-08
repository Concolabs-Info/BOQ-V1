"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { deleteProject, getProject, updateProject } from "@/features/projects/services/projectService";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { ProjectResponse, ProjectStatus } from "@/shared/types/apiTypes";

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; dotClassName: string }> = [
  { value: "active", label: "Active", dotClassName: "bg-emerald-500" },
  { value: "on_hold", label: "On hold", dotClassName: "bg-amber-500" },
  { value: "completed", label: "Completed", dotClassName: "bg-blue-500" },
  { value: "archived", label: "Archived", dotClassName: "bg-slate-500" }
];

export function ProjectHeaderActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getProject(projectId)
      .then((nextProject) => {
        if (mounted) setProject(nextProject);
      })
      .catch((nextError) => {
        if (mounted) setError(nextError instanceof Error ? nextError.message : "Project actions could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, [projectId]);

  async function changeStatus(nextStatus: ProjectStatus) {
    if (!project || project.status === nextStatus) return;
    setIsMutating(true);
    setError(null);
    try {
      const saved = await updateProject(project.id, { status: nextStatus });
      setProject(saved);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project status could not be updated.");
    } finally {
      setIsMutating(false);
    }
  }

  async function confirmDeleteProject() {
    if (!project) return;
    setIsMutating(true);
    setError(null);
    try {
      await deleteProject(project.id);
      router.push(appRoutes.projects);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Project could not be deleted.");
      setIsMutating(false);
    }
  }

  return (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            disabled={isMutating}
            aria-label="Open project actions"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Project actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={appRoutes.projectOverview(projectId)}>Edit project details</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-slate-500">Change status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={project?.status}
            onValueChange={(value) => void changeStatus(value as ProjectStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} disabled={!project || isMutating}>
                <span className={`mr-2 size-2 rounded-full ${option.dotClassName}`} />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {error ? (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs leading-5 text-red-600">{error}</p>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-700"
            disabled={!project || isMutating}
            onSelect={(event) => {
              event.preventDefault();
              setDeleteOpen(true);
            }}
          >
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes {project?.name ? `"${project.name}"` : "this project"} and its related project data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isMutating}
            onClick={(event) => {
              event.preventDefault();
              void confirmDeleteProject();
            }}
          >
            {isMutating ? "Deleting" : "Delete project"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
