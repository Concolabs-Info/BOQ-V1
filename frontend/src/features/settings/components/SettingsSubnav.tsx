"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

const ITEMS = [
  { href: appRoutes.organizationSettings, label: "Company" },
  { href: appRoutes.organizationMembers, label: "Members" },
  { href: appRoutes.organizationRoles, label: "Roles" },
  { href: appRoutes.accountProfile, label: "Account" },
  { href: appRoutes.accountSecurity, label: "Security" },
] as const;

export function SettingsSubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-blue-200 hover:text-blue-700"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
