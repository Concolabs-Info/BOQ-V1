export const ROLES = [
  "admin",
  "chief_estimator",
  "qs",
  "qa_checker",
  "project_manager",
] as const;

export type RoleKey = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Owner / Admin",
  chief_estimator: "Chief Estimator",
  qs: "Quantity Surveyor",
  qa_checker: "QA Checker",
  project_manager: "Project Manager",
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  admin: "Company director or ops manager. Full access.",
  chief_estimator: "Senior QS. Sets rates and final sign-off.",
  qs: "Quantity Surveyor. Takeoff, bill items, and export. Rates and team admin stay with the Chief Estimator and Owner.",
  qa_checker: "Independently verifies quantities before finalization.",
  project_manager: "Approves and submits, and does not touch measurements.",
};

export const ASSIGNABLE_ROLES: RoleKey[] = [
  "chief_estimator",
  "qs",
  "qa_checker",
  "project_manager",
];

export const DEFAULT_INVITE_ROLE: RoleKey = "qs";

export function isProjectScoped(role: string) {
  return role !== "admin";
}

export const PERMISSION_GROUPS: { title: string; keys: { key: string; name: string }[] }[] = [
  {
    title: "Pre",
    keys: [
      { key: "pipeline:upload", name: "Upload PDF" },
      { key: "pipeline:configure", name: "Set up drawings" },
      { key: "pipeline:start_takeoff", name: "Start takeoff" },
    ],
  },
  {
    title: "Takeoff",
    keys: [
      { key: "takeoff:edit", name: "Edit takeoff" },
      { key: "takeoff:resolve_dispute", name: "Resolve disputes" },
      { key: "takeoff:view", name: "View takeoff" },
    ],
  },
  {
    title: "Review & BOQ",
    keys: [
      { key: "review:confirm", name: "Confirm review" },
      { key: "review:view", name: "View review" },
      { key: "boq:view", name: "View BOQ" },
      { key: "boq:rates_manage", name: "Manage rates" },
      { key: "boq:add_item", name: "Add bill item" },
      { key: "boq:templates_manage", name: "Manage templates" },
      { key: "boq:unmeasured_input", name: "Unmeasured input" },
      { key: "boq:export", name: "Export BOQ" },
    ],
  },
  {
    title: "Company",
    keys: [
      { key: "company:manage", name: "Manage company" },
      { key: "members:manage", name: "Manage members" },
      { key: "billing:manage", name: "Manage billing" },
    ],
  },
];

export const PERMISSION_MATRIX: Record<string, RoleKey[]> = {
  "pipeline:upload": ["admin", "chief_estimator", "qs"],
  "pipeline:configure": ["admin", "chief_estimator", "qs"],
  "pipeline:start_takeoff": ["admin", "chief_estimator", "qs"],
  "takeoff:edit": ["admin", "chief_estimator", "qs"],
  "takeoff:resolve_dispute": ["admin", "chief_estimator", "qa_checker"],
  "takeoff:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
  "review:confirm": ["admin", "chief_estimator", "qa_checker"],
  "review:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
  "boq:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
  "boq:rates_manage": ["admin", "chief_estimator"],
  "boq:add_item": ["admin", "chief_estimator", "qs"],
  "boq:templates_manage": ["admin", "chief_estimator"],
  "boq:unmeasured_input": ["admin", "chief_estimator", "qs"],
  "boq:export": ["admin", "chief_estimator", "qs", "project_manager"],
  "company:manage": ["admin"],
  "members:manage": ["admin"],
  "billing:manage": ["admin"],
};

export const CUSTOM_ROLE_PREFIX = "custom_";

export function isBuiltInRole(role: string): role is RoleKey {
  return (ROLES as readonly string[]).includes(role);
}

export function isCustomRoleKey(role: string): boolean {
  return role.startsWith(CUSTOM_ROLE_PREFIX);
}

export function roleLabel(role: string, customName?: string): string {
  if (customName) return customName;
  return ROLE_LABELS[role as RoleKey] ?? role.replace(/^custom_/, "").replaceAll("_", " ");
}

export function isRoleKey(role: string): role is RoleKey {
  return isBuiltInRole(role);
}

export const CUSTOM_PERMISSION_GROUPS = PERMISSION_GROUPS.map((group) => ({
  ...group,
  keys: group.keys.filter((item) => item.key !== "billing:manage"),
}));
