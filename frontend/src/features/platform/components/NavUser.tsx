"use client";

import { Menu } from "@base-ui/react/menu";
import { useClerk, useUser } from "@clerk/nextjs";
import { signOutAndGo } from "@/features/auth/hard-navigate";
import { cn } from "@/shared/lib/cn";
import { useAccess } from "@/features/platform/hooks/useAccess";

export function ClerkAvatar({
  imageUrl,
  name,
  email,
  className,
  cacheKey,
}: {
  imageUrl?: string | null;
  name: string;
  email?: string | null;
  className?: string;
  cacheKey?: string | number | Date | null;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    email?.[0]?.toUpperCase() ||
    "?";
  const src = photoSrc(imageUrl, cacheKey);

  return (
    <span className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-600", className)}>
      {src ? (
        <img key={src} src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex size-full items-center justify-center">{initials}</span>
      )}
    </span>
  );
}

function photoSrc(imageUrl?: string | null, cacheKey?: string | number | Date | null) {
  if (!imageUrl) return null;
  if (cacheKey == null || cacheKey === "") return imageUrl;
  const stamp = cacheKey instanceof Date ? cacheKey.getTime() : cacheKey;
  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${stamp}`;
}

export function NavUser() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { roleLabel } = useAccess();
  if (!isLoaded || !user) return null;

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || email || "Your profile";
  const subtitle = roleLabel || email;

  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2 py-2 text-left outline-none transition hover:bg-slate-50 data-[popup-open]:bg-slate-50">
        <ClerkAvatar imageUrl={user.imageUrl} cacheKey={user.updatedAt} name={name} email={email} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-950">{name}</span>
          {subtitle ? <span className="block truncate text-xs text-slate-500">{subtitle}</span> : null}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="right" align="end" sideOffset={8} className="z-[90] outline-none">
          <Menu.Popup className="min-w-56 origin-[var(--transform-origin)] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg outline-none">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <ClerkAvatar imageUrl={user.imageUrl} cacheKey={user.updatedAt} name={name} email={email} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
                {roleLabel ? <p className="truncate text-xs text-slate-500">{roleLabel}</p> : null}
                {email ? <p className="truncate text-xs text-slate-500">{email}</p> : null}
              </div>
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <Menu.Item
              className="flex h-9 cursor-pointer items-center rounded-xl px-3 text-sm font-medium text-red-600 outline-none select-none data-[highlighted]:bg-red-50"
              onClick={() => void signOutAndGo(clerk)}
            >
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ChevronsUpDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
