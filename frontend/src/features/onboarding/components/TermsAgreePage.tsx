"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarkdownDoc } from "@/features/legal/MarkdownDoc";
import { hasAcceptedTerms } from "@/features/legal/termsClient";
import type { TermsDocument } from "@/features/legal/parseTerms";
import { getPlatformContext } from "@/features/platform/services/platformService";
import { Button } from "@/shared/components/Button";
import { acceptTerms, continueAfterTerms } from "../api";
import { FLOW_STEPS, INVITE_FLOW_STEPS } from "../types";
import { BrandRailNote, OnboardingStepper } from "./OnboardingStepper";
import { OnboardingShell } from "./OnboardingShell";
import { SignedInAs } from "./SignedInAs";

const TERMS_PROSE =
  "flex flex-col gap-4 text-sm leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline [&_em]:italic [&_h2]:mt-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-950 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-950 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_strong]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1";

export function TermsAgreePage({ document }: { document: TermsDocument }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSetup = searchParams.get("from") === "setup";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(!fromSetup);

  function checkScroll(el: HTMLDivElement) {
    if (el.scrollHeight <= el.clientHeight + 8 || el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setReachedEnd(true);
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) checkScroll(el);
  }, [document.markdown]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const context = await getPlatformContext();
        if (!mounted) return;
        setInvited(!context.organization);
        if (hasAcceptedTerms(context, document)) {
          router.replace(await continueAfterTerms());
        }
      } catch {
        // Stay on the agree screen until they can submit.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [document.version, router]);

  async function agree() {
    if (!reachedEnd || pending) return;
    setPending(true);
    setError(null);
    try {
      await acceptTerms(document.version);
      router.replace(await continueAfterTerms());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't save your agreement. Try again.");
      setPending(false);
    }
  }

  const steps = invited ? INVITE_FLOW_STEPS : FLOW_STEPS;
  const current = steps.length - 1;
  const showStepper = invited || fromSetup;

  return (
    <OnboardingShell
      layout="document"
      rail={showStepper ? <OnboardingStepper current={current} steps={steps} /> : <BrandRailNote />}
      heading="Terms of Service"
      sub="Read to the end, then agree to continue. This includes how we send project data to AI models to produce takeoff and BOQ outputs."
      mobileHint={showStepper ? `Step ${current + 1} of ${steps.length}` : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white [clip-path:inset(0_round_1rem)]">
          <div
            ref={scrollRef}
            tabIndex={0}
            onScroll={(event) => checkScroll(event.currentTarget)}
            className="terms-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            <div className={TERMS_PROSE}>
              <MarkdownDoc markdown={document.markdown} />
            </div>
          </div>
        </div>
        {error ? <p className="text-sm leading-6 text-red-600">{error}</p> : null}
        <Button
          type="button"
          pending={pending}
          disabled={!reachedEnd}
          className="h-11 w-full rounded-xl"
          onClick={() => void agree()}
        >
          {pending ? "Saving…" : "Agree and continue"}
        </Button>
        <SignedInAs />
      </div>
    </OnboardingShell>
  );
}
