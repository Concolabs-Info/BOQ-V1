"use client";

import { Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/i18n/LocaleProvider";
import { locales } from "@/i18n/locales";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const current = locales.find((option) => option.code === locale);

  return (
    <Select value={locale} onValueChange={(next) => setLocale(String(next))}>
      <SelectTrigger
        aria-label="Language"
        className="!h-auto !w-auto shrink-0 !gap-1 !border-none !bg-transparent !p-0 text-xs text-muted-foreground !shadow-none !ring-0 hover:text-foreground"
      >
        <Globe className="size-3.5 shrink-0" aria-hidden="true" />
        <SelectValue>{current?.short ?? locale}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="end"
        side="top"
        className="!rounded-lg !border-border !p-1 !shadow-md"
        style={{ width: "auto", minWidth: "9rem" }}
      >
        {locales.map((option) => (
          <SelectItem
            key={option.code}
            value={option.code}
            disabled={!option.enabled}
            className="!py-1.5 text-sm data-[highlighted]:!bg-muted data-[highlighted]:!text-foreground"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
