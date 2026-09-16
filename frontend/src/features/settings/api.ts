import { sendInvites } from "@/features/onboarding/api";
import { ApiRequestError, requestJson } from "@/shared/services/apiClient";

export { sendInvites };

export type CompanySettings = {
  id: string;
  name: string;
  domain: string | null;
  registration_type: string | null;
  registration_number: string | null;
  tax_id: string | null;
  country: string;
  currency: string;
  phone: string | null;
  role: string;
  permissions: string[];
};

export type CompanyMember = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  role_label: string;
  created_at: string | null;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: string;
  workspace_ids: string[];
  expires_at: string | null;
  created_at: string | null;
};

export type MemberDirectory = {
  members: CompanyMember[];
  invitations: PendingInvite[];
};

export function settingsError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const raw = error.details?.message || error.rawMessage || "";
    if (raw === "insufficient_permission") return "You need permission to do that.";
    if (raw === "onboarding_incomplete") return "Finish setting up your company first.";
    if (error.details?.message) return error.details.message;
    if (error.rawMessage && !error.message.startsWith("This project")) return error.rawMessage;
    return error.details?.message || error.rawMessage || error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function getCompanySettings() {
  return requestJson<CompanySettings>("/api/v1/platform/company", { skipCache: true });
}

export function updateCompanySettings(payload: {
  name: string;
  country: string;
  tax_id?: string | null;
  phone?: string | null;
}) {
  return requestJson<CompanySettings>("/api/v1/platform/company", {
    method: "PATCH",
    body: JSON.stringify(payload),
    skipCache: true,
  });
}

export function getMemberDirectory() {
  return requestJson<MemberDirectory>("/api/v1/platform/company/members", { skipCache: true });
}

export function updateMemberRole(userId: string, role: string) {
  return requestJson<{ id: string; role: string; role_label: string }>(
    `/api/v1/platform/company/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
      skipCache: true,
    },
  );
}

export function removeMember(userId: string) {
  return requestJson<void>(`/api/v1/platform/company/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    skipCache: true,
  });
}

export function revokeInvite(invitationId: string) {
  return requestJson<void>(`/api/v1/platform/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST",
    skipCache: true,
  });
}

export function resendInvite(invitationId: string) {
  return requestJson<{ sent: number; failures: { email: string; reason: string }[] }>(
    `/api/v1/platform/invitations/${encodeURIComponent(invitationId)}/resend`,
    {
      method: "POST",
      skipCache: true,
    },
  );
}
