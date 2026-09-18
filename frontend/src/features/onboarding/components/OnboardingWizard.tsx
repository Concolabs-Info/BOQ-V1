"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { appRoutes } from "@/shared/constants/appRoutes";
import { fetchTermsMeta, hasAcceptedTerms } from "@/features/legal/termsClient";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { getOnboardingStatus } from "../api";
import { FLOW_STEPS, WIZARD_STEP_OFFSET, type CreatedProject, type OnboardingStatus, type WizardStep } from "../types";
import { AcceptInviteStep } from "./AcceptInviteStep";
import { CreateCompanyLocked } from "./CreateCompanyLocked";
import { CreateCompanyManual } from "./CreateCompanyManual";
import { FirstProjectStep } from "./FirstProjectStep";
import { InviteStep } from "./InviteStep";
import { JoinCompany } from "./JoinCompany";
import { BrandRailNote, OnboardingStepper } from "./OnboardingStepper";
import { OnboardingShell } from "./OnboardingShell";
import { RemovedFromCompany } from "./RemovedFromCompany";
import { SignedInAs } from "./SignedInAs";

const STEP_INDEX: Record<WizardStep, number> = { branch: 0, project: 1, invite: 2 };

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const asFounder = searchParams.get("founder") === "1";
  const afterDelete = searchParams.get("after") === "deleted";
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [step, setStep] = useState<WizardStep>("branch");
  const [firstProject, setFirstProject] = useState<CreatedProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getOnboardingStatus(asFounder, afterDelete)
      .then(async (next) => {
        if (!mounted) return;
        setStatus(next);
        if (next.path === "DONE") {
          try {
            const [context, meta] = await Promise.all([getPlatformContext(), fetchTermsMeta()]);
            if (!mounted) return;
            router.replace(hasAcceptedTerms(context, meta) ? appRoutes.projects : appRoutes.onboardingTerms);
          } catch {
            if (mounted) router.replace(appRoutes.onboardingTerms);
          }
          return;
        }
        if (next.path === "CONTINUE_WIZARD") setStep("project");
      })
      .catch((caught) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "Onboarding could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, [asFounder, afterDelete, router]);

  if (error) {
    return (
      <OnboardingShell rail={<BrandRailNote />} heading="Could not load setup">
        <ErrorMessage message={error} />
      </OnboardingShell>
    );
  }

  if (!status || status.path === "DONE") {
    return (
      <OnboardingShell rail={<BrandRailNote />} heading="Setting up">
        <LoadingState label="Loading your company setup" />
      </OnboardingShell>
    );
  }

  if (status.path === "REMOVED" && status.former_company_name && !afterDelete && !asFounder) {
    return <RemovedFromCompany companyName={status.former_company_name} reason={status.former_reason} />;
  }

  if (status.path === "ACCEPT_INVITE") {
    const label = status.existing_company?.name ?? "your company";
    return (
      <OnboardingShell
        rail={<BrandRailNote />}
        heading={`Join ${label}`}
        sub="You've been invited. You'll only see the projects they picked for you."
      >
        <AcceptInviteStep company={status.existing_company} projectCount={status.pending_project_count ?? 0} />
      </OnboardingShell>
    );
  }

  if (status.path === "REQUEST_TO_JOIN") {
    const label = status.existing_company?.name ?? status.domain ?? "your company";
    return (
      <OnboardingShell
        rail={<BrandRailNote />}
        heading={afterDelete ? `${label} is still on Quanto` : `${label} is already on Quanto`}
        sub={
          afterDelete
            ? "Your previous company was deleted. Send a request to join this one. An admin approves it from their members list."
            : "Send a request to join. An admin approves it from their members list."
        }
      >
        <div className="flex flex-col gap-6">
          <JoinCompany company={status.existing_company} domain={status.domain} />
          <SignedInAs />
        </div>
      </OnboardingShell>
    );
  }

  const current = WIZARD_STEP_OFFSET + STEP_INDEX[step];
  let heading = afterDelete ? "Create a new company" : "Set up your company";
  let sub = afterDelete
    ? "Your previous company was deleted. A few details to get started again."
    : "A few details to get started. Billing and tax info come later.";
  let body = <CreateCompanyManual onCreated={() => setStep("project")} />;

  if (step === "branch" && status.path === "CREATE_WITH_DOMAIN_LOCK") {
    heading = afterDelete
      ? `Set up ${status.suggested_name || "your company"} again`
      : `Set up ${status.suggested_name || "your company"}`;
    sub = afterDelete
      ? "Your previous company was deleted. Create a new one to keep working on projects."
      : "You'll be the owner. We matched your work email domain.";
    body = <CreateCompanyLocked suggestedName={status.suggested_name} onCreated={() => setStep("project")} />;
  } else if (step === "project") {
    heading = "Create your first project";
    sub = "Same details as a new project later. Only the name is required.";
    body = (
      <FirstProjectStep
        onCreated={(project) => {
          setFirstProject(project);
          setStep("invite");
        }}
        onSkip={() => setStep("invite")}
      />
    );
  } else if (step === "invite") {
    heading = "Invite your team";
    sub = firstProject
      ? `Optional. People without an account get an email. Anyone who already has a Quanto account joins the next time they sign in, and they'll only see ${firstProject.name} unless you change that.`
      : "Optional. People without an account get an email. Anyone who already has a Quanto account joins the next time they sign in.";
    body = (
      <InviteStep
        projects={firstProject ? [{ id: firstProject.id, name: firstProject.name }] : []}
        onDone={() => router.replace(`${appRoutes.onboardingTerms}?from=setup`)}
      />
    );
  }

  return (
    <OnboardingShell
      rail={<OnboardingStepper current={current} />}
      heading={heading}
      sub={sub}
      mobileHint={`Step ${current + 1} of ${FLOW_STEPS.length}`}
    >
      <div className="flex flex-col gap-6">
        {body}
        <SignedInAs />
      </div>
    </OnboardingShell>
  );
}
