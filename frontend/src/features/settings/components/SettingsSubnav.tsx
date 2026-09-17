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
    <nav className="flex flex-col gap-1 lg:sticky lg:top-0 lg:w-52 lg:shrink-0">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "flex items-center rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
                : "flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
