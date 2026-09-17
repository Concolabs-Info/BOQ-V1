"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/Button";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { claimInvitation } from "../api";
import type { ExistingCompany } from "../types";
import { SignedInAs } from "./SignedInAs";

export function AcceptInviteStep({
  company,
  projectCount = 0,
}: {
  company: ExistingCompany | null;
  projectCount?: number;
}) {
  const router = useRouter();
  const started = useRef(false);
  const label = company?.name ?? "the company";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  async function join() {
    setPending(true);
    setError(null);
    try {
      const result = await claimInvitation();
      if (result.claimed || result.already_member) {
        router.replace(appRoutes.projects);
        return;
      }
      setError("This invitation is no longer valid. Ask an admin to send a new one.");
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 410) {
        setError("This invitation has expired. Ask an admin to send a new one.");
      } else {
        setError(caught instanceof Error ? caught.message : "We couldn't finish joining. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {pending && !error ? (
        <p className="text-sm leading-6 text-slate-500">Joining {label}…</p>
      ) : null}
      {error ? (
        <>
          <p className="text-sm leading-6 text-red-600">{error}</p>
          <Button type="button" className="h-11 w-full rounded-xl" onClick={() => void join()}>
            Try again
          </Button>
        </>
      ) : !pending ? (
        <Button type="button" className="h-11 w-full rounded-xl" onClick={() => void join()}>
          Join {label}
        </Button>
      ) : null}
      {projectCount > 0 ? (
        <p className="text-sm leading-6 text-slate-500">
          You'll only see the {projectCount === 1 ? "project they picked" : `${projectCount} projects they picked`}.
        </p>
      ) : (
        <p className="text-sm leading-6 text-slate-500">
          You can join now. An owner can add you to a project from Settings after.
        </p>
      )}
      <SignedInAs />
    </div>
  );
}
