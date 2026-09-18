"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { actionReason } from "@/features/settings/access";
import type { BoqTemplatePackage } from "../types";

export function BoqToolbar({
  title,
  status,
  templateId,
  templates,
  saving,
  stale,
  onTemplateChange,
  onAddTemplate,
  onManageTemplates,
  onRefresh,
  onDownload,
  onExportHistory,
  onSettings,
  canExport = true,
  canTemplates = true,
  canSetup = true,
}: {
  title: string;
  status: "ready" | "updating";
  templateId: string;
  templates: BoqTemplatePackage[];
  saving: boolean;
  stale: boolean;
  onTemplateChange: (templateId: string) => void;
  onAddTemplate: () => void;
  onManageTemplates: () => void;
  onRefresh: () => void;
  onDownload: (format: "pdf" | "xlsx" | "csv" | "json") => void;
  onExportHistory: () => void;
  onSettings: () => void;
  canExport?: boolean;
  canTemplates?: boolean;
  canSetup?: boolean;
}) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadDisabled = saving || stale || !canExport;

  function chooseDownload(format: "pdf" | "xlsx" | "csv" | "json") {
    setDownloadOpen(false);
    onDownload(format);
  }

  return (
    <div className="border-b border-slate-200 bg-white px-5 py-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {status === "ready" ? "Ready" : "Updating"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Template</span>
            <select
              className="h-9 min-w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-300"
              value={templateId}
              onChange={(event) => onTemplateChange(event.target.value)}
              disabled={saving || !canTemplates}
              title={canTemplates ? undefined : actionReason("boq:templates_manage")}
            >
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <Button variant="secondary" title={canTemplates ? undefined : actionReason("boq:templates_manage")} disabled={saving || !canTemplates} onClick={onAddTemplate}>+ Add template</Button>
            <Button variant="ghost" title={canTemplates ? undefined : actionReason("boq:templates_manage")} disabled={saving || !templateId || !canTemplates} onClick={onManageTemplates}>Manage templates</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={saving} onClick={onRefresh}>Refresh</Button>
          <div className="relative">
            <Button disabled={downloadDisabled} title={canExport ? undefined : actionReason("boq:export")} onClick={() => setDownloadOpen((value) => !value)}>Download ▾</Button>
            {downloadOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <DownloadOption label="PDF" onClick={() => chooseDownload("pdf")} />
                <DownloadOption label="Excel" onClick={() => chooseDownload("xlsx")} />
                <DownloadOption label="CSV" onClick={() => chooseDownload("csv")} />
                <DownloadOption label="JSON" onClick={() => chooseDownload("json")} />
                <div className="my-1 border-t border-slate-100" />
                <DownloadOption label="Export history" onClick={() => { setDownloadOpen(false); onExportHistory(); }} />
              </div>
            ) : null}
          </div>
          <Button variant="secondary" title={canSetup ? undefined : actionReason("boq:rates_manage")} disabled={saving || !canSetup} onClick={onSettings}>Settings</Button>
        </div>
      </div>
    </div>
  );
}

function DownloadOption({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onClick}>{label}</button>;
}
