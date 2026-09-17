"use client";

import * as Flags from "country-flag-icons/react/3x2";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES } from "../countries";

function Flag({ code }: { code: string }) {
  const Component = Flags[code as keyof typeof Flags];
  if (!Component) return null;
  return <Component aria-hidden className="block h-3.5 w-5 shrink-0 rounded-[2px]" />;
}

export function CountrySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selected = COUNTRIES.find((country) => country.name === value);

  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => onChange(String(next))}>
      <SelectTrigger id={id}>
        <SelectValue>
          <span className="flex items-center gap-2">
            {selected ? <Flag code={selected.code} /> : null}
            <span>{selected?.name ?? "Select a country"}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {COUNTRIES.map((country) => (
          <SelectItem key={country.code} value={country.name}>
            <Flag code={country.code} />
            <span>{country.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
