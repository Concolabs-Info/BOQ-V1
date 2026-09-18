import { fetchTermsMeta, hasAcceptedTerms } from "@/features/legal/termsClient";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { removeCachedJson, requestJson } from "@/shared/services/apiClient";
import { appRoutes } from "@/shared/constants/appRoutes";
import type { CreatedCompany, CreatedProject, OnboardingStatus } from "./types";

const STATUS_PATH = "/api/v1/platform/onboarding/status";
const ME_PATH = "/api/v1/platform/me";

export function getOnboardingStatus(asFounder = false, afterDeleted = false) {
  const params = new URLSearchParams();
  if (asFounder) params.set("founder", "true");
  if (afterDeleted) params.set("after_deleted", "true");
  const query = params.toString();
  const path = query ? `${STATUS_PATH}?${query}` : STATUS_PATH;
  return requestJson<OnboardingStatus>(path, { skipCache: true });
}

export async function createOnboardingCompany(payload: {
  name: string;
  country: string;
  registration_type?: "PV" | "BR" | "NONE";
  registration_number?: string;
  lock_domain?: boolean;
}) {
  const created = await requestJson<CreatedCompany>("/api/v1/platform/onboarding/company", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCache: true,
  });
  removeCachedJson(ME_PATH);
  return created;
}

export async function createOnboardingProject(payload: {
  name: string;
  client_name?: string;
  location?: string;
  project_number?: string;
  description?: string;
}) {
  const created = await requestJson<CreatedProject>("/api/v1/platform/onboarding/project", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCache: true,
  });
  removeCachedJson(ME_PATH);
  return created;
}

export type InviteFailure = { email: string; reason: string };

export function sendInvites(invites: { email: string; role: string; workspace_ids?: string[] }[]) {
  return requestJson<{ sent: number; existing_accounts?: string[]; failures: InviteFailure[] }>(
    "/api/v1/platform/invitations",
    {
      method: "POST",
      body: JSON.stringify({ invites }),
      skipCache: true,
    },
  );
}

export function declinePendingInvites() {
  return requestJson<{ ok: boolean; revoked: number }>("/api/v1/platform/onboarding/invite/decline", {
    method: "POST",
    skipCache: true,
  });
}

export function claimInvitation(token?: string | null) {
  return requestJson<{
    claimed: boolean;
    already_member: boolean;
    company_id: string | null;
    company_name: string | null;
    role: string | null;
  }>("/api/v1/platform/invitations/claim", {
    method: "POST",
    body: JSON.stringify({ token: token || null }),
    skipCache: true,
  }).then((result) => {
    removeCachedJson(ME_PATH);
    return result;
  });
}

export function acceptTerms(version: string) {
  return requestJson<{ ok: boolean; terms_version: string }>("/api/v1/platform/onboarding/terms", {
    method: "POST",
    body: JSON.stringify({ version }),
    skipCache: true,
  }).then((result) => {
    removeCachedJson(ME_PATH);
    return result;
  });
}

export async function currentTermsAccepted() {
  try {
    const [context, meta] = await Promise.all([getPlatformContext(), fetchTermsMeta()]);
    return hasAcceptedTerms(context, meta);
  } catch {
    return false;
  }
}

export async function continueAfterTerms(): Promise<string> {
  try {
    const claimed = await claimInvitation();
    if (claimed.claimed || claimed.already_member) {
      return appRoutes.projects;
    }
  } catch {
    // No open invite — fall through to onboarding or the project library.
  }
  const status = await getOnboardingStatus();
  if (status.has_company || status.path === "DONE") {
    return appRoutes.projects;
  }
  return appRoutes.onboarding;
}
