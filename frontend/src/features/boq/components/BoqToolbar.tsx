"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const closeDownloadTimer = useRef<number | null>(null);
  const downloadDisabled = saving || stale;

  useEffect(() => {
    if (downloadDisabled) {
      clearDownloadClose();
      setDownloadOpen(false);
    }
  }, [downloadDisabled]);

  useEffect(() => {
    return () => {
      if (closeDownloadTimer.current) window.clearTimeout(closeDownloadTimer.current);
    };
  }, []);

  function clearDownloadClose() {
    if (!closeDownloadTimer.current) return;
    window.clearTimeout(closeDownloadTimer.current);
    closeDownloadTimer.current = null;
  }

  function openDownloadMenu() {
    if (downloadDisabled) return;
    clearDownloadClose();
    setDownloadOpen(true);
  }

  function scheduleDownloadClose() {
    clearDownloadClose();
    closeDownloadTimer.current = window.setTimeout(() => setDownloadOpen(false), 140);
  }

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Template</span>
            <Select
              value={templateId}
              onValueChange={onTemplateChange}
              disabled={saving}
            >
              <SelectTrigger className="h-10 min-w-52 rounded-lg bg-white font-medium text-slate-800">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="h-10" variant="outline" disabled={saving} onClick={onAddTemplate}><Plus aria-hidden="true" />Add template</Button>
            <Button className="h-10" variant="ghost" disabled={saving || !templateId} onClick={onManageTemplates}>Manage templates</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-10" variant="outline" disabled={saving} onClick={onRefresh}><RefreshCw aria-hidden="true" />Refresh</Button>
          <DropdownMenu modal={false} open={downloadOpen && !downloadDisabled} onOpenChange={(open) => {
            clearDownloadClose();
            setDownloadOpen(open && !downloadDisabled);
          }}>
            <div onMouseEnter={openDownloadMenu} onMouseLeave={scheduleDownloadClose}>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-10"
                  disabled={downloadDisabled}
                  onFocus={openDownloadMenu}
                  onPointerEnter={openDownloadMenu}
                >
                  <Download aria-hidden="true" />
                  Download
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onMouseEnter={openDownloadMenu}
                onMouseLeave={scheduleDownloadClose}
              >
                <DownloadOption label="PDF" onSelect={() => chooseDownload("pdf")} />
                <DownloadOption label="Excel" onSelect={() => chooseDownload("xlsx")} />
                <DownloadOption label="CSV" onSelect={() => chooseDownload("csv")} />
                <DownloadOption label="JSON" onSelect={() => chooseDownload("json")} />
                <DropdownMenuSeparator />
                <DownloadOption label="Export history" onSelect={() => { setDownloadOpen(false); onExportHistory(); }} />
              </DropdownMenuContent>
            </div>
          </DropdownMenu>
          <Button className="h-10" variant="ghost" disabled={saving} onClick={onSettings}><Settings2 aria-hidden="true" />Settings</Button>
        </div>
      </div>
    </div>
  );
}

function DownloadOption({ label, onSelect }: { label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect}>{label}</DropdownMenuItem>;
}
