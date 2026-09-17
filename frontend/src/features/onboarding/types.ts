export type OnboardingPath =
  | "REQUEST_TO_JOIN"
  | "ACCEPT_INVITE"
  | "CREATE_WITH_DOMAIN_LOCK"
  | "CREATE_MANUAL"
  | "CONTINUE_WIZARD"
  | "REMOVED"
  | "DONE";

export type WizardStep = "branch" | "invite" | "project";

export type ExistingCompany = {
  id: string;
  name: string;
  domain?: string | null;
};

export type OnboardingStatus = {
  path: OnboardingPath;
  domain: string | null;
  suggested_name: string;
  existing_company: ExistingCompany | null;
  former_company_name: string | null;
  has_company: boolean;
  has_project: boolean;
  pending_project_count?: number;
};

export type CreatedCompany = {
  id: string;
  name: string;
  role: string;
};

export type CreatedProject = {
  id: string;
  name: string;
};

export const FLOW_STEPS = [
  { title: "Account", blurb: "Your name, email and password" },
  { title: "Company", blurb: "Name and country" },
  { title: "Project", blurb: "Your first job" },
  { title: "Invite team", blurb: "Optional teammates" },
] as const;

export const WIZARD_STEP_OFFSET = 1;
