"use client";

import { COUNTRIES } from "../countries";
import { AUTH_CONTROL_CLASS } from "@/features/auth/components/AuthField";

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
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={AUTH_CONTROL_CLASS}
    >
      {COUNTRIES.map((country) => (
        <option key={country.code} value={country.name}>
          {country.name}
        </option>
      ))}
    </select>
  );
}
