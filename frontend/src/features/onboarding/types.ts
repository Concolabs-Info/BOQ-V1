export type OnboardingPath =
  | "REQUEST_TO_JOIN"
  | "CREATE_WITH_DOMAIN_LOCK"
  | "CREATE_MANUAL"
  | "CONTINUE_WIZARD"
  | "REMOVED"
  | "DONE";

export type WizardStep = "branch" | "invite" | "workspace";

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
  { title: "Invite team", blurb: "Optional teammates" },
  { title: "Project workspace", blurb: "Your first job" },
] as const;

export const WIZARD_STEP_OFFSET = 1;
