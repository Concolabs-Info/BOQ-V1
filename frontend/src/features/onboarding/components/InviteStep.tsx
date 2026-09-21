"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { ASSIGNABLE_ROLES, DEFAULT_INVITE_ROLE, roleLabel } from "@/features/settings/rbac";
import { ProjectAccessField, type ProjectOption } from "@/features/settings/components/ProjectAccessPicker";
import { sendInvites } from "../api";
import { onboarding3dButton } from "./onboardingButtonStyle";

type Row = { id: number; email: string; role: string };

export function InviteStep({
  onDone,
  projects = [],
}: {
  onDone: () => void;
  projects?: ProjectOption[];
}) {
  const t = useTranslations("onboarding.invite");
  const nextId = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ id: 0, email: "", role: DEFAULT_INVITE_ROLE }]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { id: nextId.current++, email: "", role: DEFAULT_INVITE_ROLE }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function send() {
    const invites = rows
      .map((row) => ({ email: row.email.trim(), role: row.role, workspace_ids: projectIds }))
      .filter((row) => row.email);
    if (invites.length === 0) {
      setNote("Add at least one email above, or skip this for now.");
      return;
    }
    setNote(null);
    setPending(true);
    try {
      const result = await sendInvites(invites);
      if (result.failures.length === 0) {
        onDone();
        return;
      }
      const existingCount = result.existing_accounts?.length ?? 0;
      const parts: string[] = [];
      if (result.sent > 0) {
        parts.push(result.sent === 1 ? "Sent 1 invitation." : `Sent ${result.sent} invitations.`);
      }
      if (existingCount === 1) {
        parts.push("One person already has an account and will join when they next sign in.");
      } else if (existingCount > 1) {
        parts.push("Some people already have accounts and will join when they next sign in.");
      }
      for (const failure of result.failures) {
        parts.push(`${failure.email}: ${failure.reason}`);
      }
      setNote(parts.join(" "));
    } catch {
      setNote("We couldn't send those invites. Mind trying again?");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {rows.map((row, index) => (
            <motion.div
              key={row.id}
              layout
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="-m-1 overflow-hidden p-1"
            >
              <div className="flex items-start gap-2 pb-1">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <Input
                    type="email"
                    placeholder="name@company.com"
                    className="h-10 min-w-0 flex-1"
                    value={row.email}
                    onChange={(event) => update(index, { email: event.target.value })}
                  />
                  <Select value={row.role} onValueChange={(next) => update(index, { role: String(next) })}>
                    <SelectTrigger className="!h-10 w-full sm:w-[11rem] sm:shrink-0">
                      <SelectValue>{roleLabel(row.role)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {index > 0 ? (
                  <button
                    type="button"
                    aria-label="Remove this row"
                    onClick={() => removeRow(index)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          className="self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={addRow}
        >
          {t("addAnother")}
        </button>
      </div>

      {projects.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{t("projectsLabel")}</p>
          <ProjectAccessField projects={projects} selectedIds={projectIds} disabled={pending} onChange={setProjectIds} />
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm leading-6 text-muted-foreground">
          {t("addLaterHintBefore")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
          {t("addLaterHintAfter")}
        </p>
      )}

      {note ? <p className="text-sm leading-6 text-muted-foreground">{note}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <LoadingButton
          type="button"
          pending={pending}
          onClick={() => void send()}
          className={`h-11 w-full sm:flex-1 ${onboarding3dButton}`}
        >
          {pending ? t("sending") : t("sendButton")}
        </LoadingButton>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone} className="h-11 w-full sm:w-auto">
          {t("skip")}
        </Button>
      </div>
    </div>
  );
}
