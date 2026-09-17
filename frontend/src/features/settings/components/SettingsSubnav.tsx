"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useAccess } from "@/features/platform/hooks/useAccess";

const ACCOUNT = [
  { href: appRoutes.accountProfile, label: "Account" },
  { href: appRoutes.accountSecurity, label: "Security" },
] as const;

export function SettingsSubnav() {
  const pathname = usePathname();
  const { can } = useAccess();
  const company = can("company:manage")
    ? [{ href: appRoutes.organizationSettings, label: "Company" }]
    : [];
  const members = can("members:manage")
    ? [
        { href: appRoutes.organizationMembers, label: "Members" },
        { href: appRoutes.organizationRoles, label: "Roles" },
      ]
    : [];
  const companyGroup = [...company, ...members];

  return (
    <nav aria-label="Settings" className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {companyGroup.length ? (
          <div className="flex items-center gap-1">
            {companyGroup.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "inline-flex shrink-0 items-center rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700"
                      : "inline-flex shrink-0 items-center rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
        {companyGroup.length ? <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200 sm:mx-2" aria-hidden /> : null}
        <div className="flex items-center gap-1">
          {ACCOUNT.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex shrink-0 items-center rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700"
                    : "inline-flex shrink-0 items-center rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
