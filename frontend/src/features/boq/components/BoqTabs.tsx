"use client";

import Link from "next/link";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useAccess } from "@/features/platform/hooks/useAccess";
import { actionReason } from "@/features/settings/access";

export type BoqTabKey = "report" | "setup" | "templates" | "exports";

export function BoqTabs({ projectId, active }: { projectId: string; active: BoqTabKey }) {
  const { can } = useAccess();
  const tabs = [
    ["report", "BOQ Report", appRoutes.workspaceBoq(projectId), true, ""] as const,
    [
      "setup",
      "Document Setup",
      appRoutes.workspaceBoqSetup(projectId),
      can("boq:rates_manage") || can("boq:templates_manage") || can("boq:add_item"),
      actionReason("boq:rates_manage"),
    ] as const,
    ["templates", "Templates", appRoutes.workspaceBoqTemplates(projectId), can("boq:templates_manage"), actionReason("boq:templates_manage")] as const,
    ["exports", "Exports", appRoutes.workspaceBoqExports(projectId), can("boq:export"), actionReason("boq:export")] as const,
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-5 pt-4">
      {tabs.map(([key, label, href, allowed, reason]) =>
        allowed ? (
          <Link
            key={key}
            href={href}
            className={`rounded-t-lg border-b-2 px-4 py-3 text-sm font-semibold transition ${active === key ? "border-blue-600 bg-blue-50/60 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ) : (
          <span
            key={key}
            title={reason}
            aria-disabled="true"
            className="cursor-not-allowed rounded-t-lg border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-slate-300"
          >
            {label}
          </span>
        ),
      )}
    </nav>
  );
}
