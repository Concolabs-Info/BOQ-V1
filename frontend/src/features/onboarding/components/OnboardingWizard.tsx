"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { LoadingState } from "@/shared/components/LoadingState";
import { appRoutes } from "@/shared/constants/appRoutes";
import { getOnboardingStatus } from "../api";
import type { CreatedProject, OnboardingStatus, WizardStep } from "../types";
import { AcceptInviteStep } from "./AcceptInviteStep";
import { CreateCompanyLocked } from "./CreateCompanyLocked";
import { CreateCompanyManual } from "./CreateCompanyManual";
import { FirstProjectStep } from "./FirstProjectStep";
import { InviteStep } from "./InviteStep";
import { JoinCompany } from "./JoinCompany";
import { MinimalShell } from "./MinimalShell";
import { OnboardingCapabilities } from "./OnboardingCapabilities";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { RemovedFromCompany } from "./RemovedFromCompany";
import { SignedInAs } from "./SignedInAs";

export function OnboardingWizard() {
  const t = useTranslations("onboarding.wizard");
  const shellT = useTranslations("shell");
  const router = useRouter();
  const searchParams = useSearchParams();
  const asFounder = searchParams.get("founder") === "1";
  const afterDelete = searchParams.get("after") === "deleted";
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [step, setStep] = useState<WizardStep>("branch");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [firstProject, setFirstProject] = useState<CreatedProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getOnboardingStatus(asFounder, afterDelete)
      .then((next) => {
        if (!mounted) return;
        setStatus(next);
        if (next.path === "DONE") {
          router.replace(appRoutes.projects);
          return;
        }
        if (next.path === "CONTINUE_WIZARD") {
          setCompanyName(next.existing_company?.name ?? null);
          setStep("capabilities");
        }
      })
      .catch((caught) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "We couldn't load your setup. Try refreshing the page.");
      });
    return () => {
      mounted = false;
    };
  }, [asFounder, afterDelete, router]);

  if (error) {
    return (
      <MinimalShell heading={shellT("couldNotLoad")} stepKey="error">
        <ErrorMessage message={error} />
      </MinimalShell>
    );
  }

  if (!status || status.path === "DONE") {
    return (
      <MinimalShell heading={shellT("settingUp")} stepKey="loading">
        <LoadingState label={shellT("loadingSetup")} />
      </MinimalShell>
    );
  }

  if (status.path === "REMOVED" && status.former_company_name && !afterDelete && !asFounder) {
    return <RemovedFromCompany companyName={status.former_company_name} reason={status.former_reason} />;
  }

  if (status.path === "ACCEPT_INVITE") {
    const label = status.existing_company?.name ?? "your company";
    return (
      <MinimalShell
        heading={t("joinCompanyTitle", { name: label })}
        sub={t("joinCompanySub")}
        stepKey="accept-invite"
        footer={<SignedInAs />}
      >
        <AcceptInviteStep company={status.existing_company} projectCount={status.pending_project_count ?? 0} />
      </MinimalShell>
    );
  }

  if (status.path === "REQUEST_TO_JOIN") {
    const label = status.existing_company?.name ?? status.domain ?? "your company";
    return (
      <MinimalShell
        heading={afterDelete ? t("stillOnQuanto", { name: label }) : t("alreadyOnQuanto", { name: label })}
        sub={afterDelete ? t("requestToJoinSubAfterDelete") : t("requestToJoinSub")}
        stepKey="request-to-join"
        footer={<SignedInAs />}
      >
        <JoinCompany company={status.existing_company} domain={status.domain} />
      </MinimalShell>
    );
  }

  if (step === "capabilities") {
    return (
      <MinimalShell
        heading={companyName ? t("capabilitiesTitleNamed", { name: companyName }) : t("capabilitiesTitle")}
        sub={t("capabilitiesSub")}
        width="2xl"
        stepKey="capabilities"
        footer={<SignedInAs />}
      >
        <OnboardingCapabilities
          onCreateProject={() => setStep("project")}
          onGoToDashboard={() => setStep("welcome")}
        />
      </MinimalShell>
    );
  }

  if (step === "project") {
    return (
      <MinimalShell
        heading={t("createProjectTitle")}
        sub={t("createProjectSub")}
        width="lg"
        stepKey="project"
        footer={<SignedInAs />}
      >
        <FirstProjectStep
          onCreated={(project) => {
            setFirstProject(project);
            setStep("invite");
          }}
          onSkip={() => setStep("invite")}
        />
      </MinimalShell>
    );
  }

  if (step === "invite") {
    const sub = firstProject
      ? t("inviteTeamSubWithProject", { project: firstProject.name })
      : t("inviteTeamSub");
    return (
      <MinimalShell heading={t("inviteTeamTitle")} sub={sub} width="lg" stepKey="invite" footer={<SignedInAs />}>
        <InviteStep
          projects={firstProject ? [{ id: firstProject.id, name: firstProject.name }] : []}
          onDone={() => setStep("welcome")}
        />
      </MinimalShell>
    );
  }

  if (step === "welcome") {
    return (
      <MinimalShell
        heading={t("welcomeTitle")}
        sub={t("welcomeSub")}
        stepKey="welcome"
        card={false}
        footer={<SignedInAs />}
      >
        <OnboardingWelcome onContinue={() => router.replace(appRoutes.projects)} />
      </MinimalShell>
    );
  }

  // step === "branch": company creation / join.
  let heading = afterDelete ? t("createCompanyTitleAfterDelete") : t("createCompanyTitle");
  let sub = afterDelete ? t("createCompanySubAfterDelete") : t("createCompanySub");

  if (status.path === "CREATE_WITH_DOMAIN_LOCK") {
    const suggested = status.suggested_name || "your company";
    heading = afterDelete
      ? t("createCompanyLockedTitleAfterDelete", { name: suggested })
      : t("createCompanyLockedTitle", { name: suggested });
    sub = afterDelete ? t("createCompanyLockedSubAfterDelete") : t("createCompanyLockedSub");
    return (
      <MinimalShell heading={heading} sub={sub} width="lg" stepKey="branch-locked" footer={<SignedInAs />}>
        <CreateCompanyLocked
          suggestedName={status.suggested_name}
          onCreated={(company) => {
            setCompanyName(company.name);
            setStep("capabilities");
          }}
        />
      </MinimalShell>
    );
  }

  return (
    <MinimalShell heading={heading} sub={sub} width="lg" stepKey="branch-manual" footer={<SignedInAs />}>
      <CreateCompanyManual
        onCreated={(company) => {
          setCompanyName(company.name);
          setStep("capabilities");
        }}
      />
    </MinimalShell>
  );
}
