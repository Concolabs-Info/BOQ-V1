"use client";

import { Menu } from "@base-ui/react/menu";
import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";

export type ProjectOption = { id: string; name: string };

export function projectNames(projects: ProjectOption[], ids: string[]) {
  const byId = new Map(projects.map((project) => [project.id, project.name]));
  return ids.map((id) => byId.get(id)).filter((name): name is string => Boolean(name));
}

export function joinProjectNames(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border",
        checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white",
      )}
      aria-hidden
    >
      {checked ? <CheckMark /> : null}
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 6.5 8 10.5 12 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function summaryLabel(projects: ProjectOption[], ids: string[], emptyLabel: string) {
  const names = projectNames(projects, ids);
  if (names.length === 0) return emptyLabel;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

function ProjectSelect({
  projects,
  selectedIds,
  onChange,
  disabled,
  emptyLabel,
  className,
}: {
  projects: ProjectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyLabel: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(needle));
  }, [projects, query]);
  const empty = selectedIds.length === 0;

  function toggle(projectId: string, selected: boolean) {
    onChange(selected ? [...selectedIds, projectId] : selectedIds.filter((id) => id !== projectId));
  }

  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <Menu.Trigger
        disabled={disabled || projects.length === 0}
        className={cn(
          "inline-flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 outline-none transition hover:border-slate-300 data-[disabled]:opacity-50 data-[popup-open]:border-blue-500 data-[popup-open]:ring-4 data-[popup-open]:ring-blue-100",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", empty && "font-normal text-slate-500")}>
          {summaryLabel(projects, selectedIds, emptyLabel)}
        </span>
        <ChevronIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-[90] outline-none"
          style={{ width: "max(var(--anchor-width), 18rem)", minWidth: "18rem" }}
        >
          <Menu.Popup className="w-full origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">
            {projects.length > 6 ? (
              <div className="p-1 pb-1.5">
                <input
                  type="search"
                  value={query}
                  placeholder="Search projects"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                />
              </div>
            ) : null}
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">No matching projects.</p>
              ) : (
                filtered.map((project) => {
                  const selected = selectedIds.includes(project.id);
                  return (
                    <Menu.CheckboxItem
                      key={project.id}
                      checked={selected}
                      label={project.name}
                      closeOnClick={false}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
                        selected
                          ? "bg-blue-50 font-medium text-blue-700"
                          : "text-slate-800 data-[highlighted]:bg-slate-50",
                      )}
                      onCheckedChange={(checked) => toggle(project.id, checked)}
                    >
                      <BoxCheck checked={selected} />
                      <span className="min-w-0 whitespace-normal break-words">{project.name}</span>
                    </Menu.CheckboxItem>
                  );
                })
              )}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ProjectChipList({
  projects,
  ids,
  empty,
}: {
  projects: ProjectOption[];
  ids: string[];
  empty: string;
}) {
  const names = projectNames(projects, ids);
  if (names.length === 0) {
    return <span className="text-sm text-slate-500">{empty}</span>;
  }
  return <span className="text-sm text-slate-700">{joinProjectNames(names)}</span>;
}

export function ProjectAccessField({
  projects,
  selectedIds,
  onChange,
  disabled,
  emptyHint = "Optional. You can assign projects later.",
}: {
  projects: ProjectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  if (projects.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">Create a project first, then you can add people to it.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ProjectSelect
        projects={projects}
        selectedIds={selectedIds}
        disabled={disabled}
        emptyLabel="Choose projects"
        className="h-11 px-4"
        onChange={onChange}
      />
      {selectedIds.length === 0 && emptyHint ? (
        <p className="text-sm leading-6 text-slate-500">{emptyHint}</p>
      ) : null}
    </div>
  );
}

export function MemberProjectControl({
  projects,
  assignedIds,
  disabled,
  onChange,
}: {
  projects: ProjectOption[];
  assignedIds: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  if (projects.length === 0) {
    return <span className="text-sm text-slate-500">No projects yet</span>;
  }

  return (
    <ProjectSelect
      projects={projects}
      selectedIds={assignedIds}
      disabled={disabled}
      emptyLabel="Add to a project"
      className="h-10 max-w-[16rem]"
      onChange={onChange}
    />
  );
}
