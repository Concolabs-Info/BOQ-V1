import { appRoutes } from "@/shared/constants/appRoutes";

export const PRE_PERMISSIONS = ["pipeline:upload", "pipeline:configure", "pipeline:start_takeoff"] as const;

export type WorkflowStage = "pre" | "takeoff" | "review" | "boq";
export type SettingsSection = "company" | "members" | "roles" | "billing" | "account";

export function hasPermission(permissions: readonly string[] | null | undefined, key: string) {
  return Boolean(permissions?.includes(key));
}

export function hasAnyPermission(permissions: readonly string[] | null | undefined, keys: readonly string[]) {
  return keys.some((key) => hasPermission(permissions, key));
}

export function canAccessStage(permissions: readonly string[] | null | undefined, stage: WorkflowStage) {
  if (stage === "pre") return hasAnyPermission(permissions, PRE_PERMISSIONS);
  if (stage === "takeoff") return hasPermission(permissions, "takeoff:view");
  if (stage === "review") return hasPermission(permissions, "review:view");
  return hasPermission(permissions, "boq:view");
}

export const BOQ_WRITE_PERMISSIONS = [
  "boq:rates_manage",
  "boq:add_item",
  "boq:templates_manage",
  "boq:unmeasured_input",
] as const;

export function workspaceHome(projectId: string, permissions: readonly string[] | null | undefined) {
  if (canAccessStage(permissions, "pre")) return appRoutes.pre(projectId, "upload");
  if (canAccessStage(permissions, "review") && hasPermission(permissions, "review:confirm")) {
    return appRoutes.workflowStep(projectId, "review");
  }
  if (canAccessStage(permissions, "boq") && (hasPermission(permissions, "boq:export") || hasAnyPermission(permissions, BOQ_WRITE_PERMISSIONS))) {
    return appRoutes.workspaceBoq(projectId);
  }
  if (canAccessStage(permissions, "takeoff")) return appRoutes.takeoff(projectId, "columns");
  if (canAccessStage(permissions, "review")) return appRoutes.workflowStep(projectId, "review");
  if (canAccessStage(permissions, "boq")) return appRoutes.workspaceBoq(projectId);
  return appRoutes.projects;
}

export function workspaceStageFromPath(pathname: string): WorkflowStage | null {
  if (!pathname.includes("/workspace/")) return null;
  if (pathname.includes("/pre/") || /\/workspace\/[^/]+\/(upload|scale|specifications|floor-plans)(?:\/|$)/.test(pathname)) {
    return "pre";
  }
  if (pathname.includes("/takeoff/") || /\/workspace\/[^/]+\/(walls|floors|roofs|ceilings|model-review)(?:\/|$)/.test(pathname)) {
    return "takeoff";
  }
  if (pathname.includes("/review")) return "review";
  if (pathname.includes("/boq")) return "boq";
  return null;
}

export const STAGE_BLOCKED_REASON: Record<WorkflowStage, string> = {
  pre: "Your role doesn't set up drawings.",
  takeoff: "Your role can't open takeoff.",
  review: "Your role can't open review.",
  boq: "Your role can't open the BOQ.",
};

export const ACTION_BLOCKED_REASON: Record<string, string> = {
  "pipeline:upload": "Your role can't upload drawings.",
  "project:edit": "Your role can't change project details.",
  "pipeline:configure": "Your role can't change drawing setup.",
  "pipeline:start_takeoff": "Your role can't start takeoff.",
  "takeoff:edit": "Your role can review this, not edit it.",
  "takeoff:resolve_dispute": "Your role can't resolve disputes.",
  "review:confirm": "Your role can view review, not confirm it.",
  "boq:export": "Your role can view the BOQ, not export it.",
  "boq:rates_manage": "Your role can't change rates.",
  "boq:add_item": "Your role can't add bill items.",
  "boq:templates_manage": "Your role can't manage templates.",
  "boq:unmeasured_input": "Your role can't edit unmeasured items.",
  "company:manage": "Only an owner can change company settings.",
  "members:manage": "Only an owner can manage members and roles.",
  "billing:manage": "Only an owner can manage billing.",
};

export function actionReason(key: string) {
  return ACTION_BLOCKED_REASON[key] ?? "You don't have access to this.";
}

export function isTakeoffViewCommand(tab: string, label: string) {
  if (tab === "view") return true;
  if (tab === "draw" || tab === "edit") return false;
  return (
    label === "Select" ||
    label === "Previous" ||
    label === "Next" ||
    label === "Pan" ||
    label === "Zoom in" ||
    label === "Zoom out" ||
    label === "Fit page" ||
    label === "Fit selection" ||
    label === "Previous view" ||
    label === "Distance" ||
    label === "Horizontal" ||
    label === "Vertical" ||
    label === "Angle" ||
    label === "Area" ||
    label === "Perimeter" ||
    label === "Radius" ||
    label === "Drawing" ||
    label === "Takeoff" ||
    label === "Labels" ||
    label === "Dimensions" ||
    label === "Layers" ||
    label === "Properties" ||
    label === "Full screen" ||
    label === "Snap" ||
    label === "Ortho"
  );
}

export function settingsSectionFromPath(pathname: string): SettingsSection | null {
  if (pathname.startsWith("/organization/members")) return "members";
  if (pathname.startsWith("/organization/roles")) return "roles";
  if (pathname.startsWith("/organization/billing")) return "billing";
  if (pathname === "/organization" || pathname.startsWith("/organization/settings")) return "company";
  if (pathname.startsWith("/account/")) return "account";
  return null;
}

export function canAccessSettingsSection(
  permissions: readonly string[] | null | undefined,
  section: SettingsSection,
) {
  if (section === "account") return true;
  if (section === "company") return hasPermission(permissions, "company:manage");
  if (section === "members" || section === "roles") return hasPermission(permissions, "members:manage");
  return hasPermission(permissions, "billing:manage");
}
