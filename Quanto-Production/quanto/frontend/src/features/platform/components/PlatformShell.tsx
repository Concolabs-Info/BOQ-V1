"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { appRoutes } from "@/shared/constants/appRoutes";

const DESKTOP_NAV_KEY = "quanto:navigation:collapsed";
let rememberedDesktopCollapsed: boolean | null = null;

export function PlatformShell({ title, eyebrow, children, headerNavigation, lockContent = false }: { title: string; eyebrow?: string; children: ReactNode; headerNavigation?: ReactNode; activeNavHref?: string; lockContent?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(rememberedDesktopCollapsed ?? false);
  useEffect(() => {
    if (rememberedDesktopCollapsed !== null) return;
    rememberedDesktopCollapsed = window.localStorage.getItem(DESKTOP_NAV_KEY) === "true";
    setDesktopCollapsed(rememberedDesktopCollapsed);
  }, []);
  function toggleDesktopNavigation() { setDesktopCollapsed((current) => { const next = !current; rememberedDesktopCollapsed = next; window.localStorage.setItem(DESKTOP_NAV_KEY, String(next)); return next; }); }

  const projectId = pathname.split("/")[2] || "demo";
  const nav = [
    { title: "Project workspace", href: appRoutes.pre(projectId, "upload") },
  ];

  const navigation = <>
    <div className="flex items-center gap-3 px-1">
      <HexLogoIcon className="h-10 w-10" />
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">Quanto</p><p className="truncate text-xs text-slate-500">BOQ production workspace</p></div>
    </div>
    <nav className="mt-8">
      <p className="px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
      <div className="mt-3 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.title === "Project workspace" && pathname.includes(`/workspace/${projectId}/`) && !pathname.endsWith("/review") && !pathname.includes("/boq"));
          return <Link key={item.title} href={item.href} onClick={() => setMobileOpen(false)} className={active ? "flex items-center rounded-xl border-l-2 border-blue-600 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700" : "flex items-center rounded-xl border-l-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"}>{item.title}</Link>;
        })}
      </div>
    </nav>
    <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Production</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">Live project data</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">Pre is connected to the project API, PostgreSQL and drawing storage.</p><button type="button" onClick={() => { window.location.reload(); }} className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700">Reload project</button>
    </div>
  </>;

  return <main className="autoboq-ui h-dvh overflow-hidden bg-[#eef3f8] text-slate-950">
    <div className="flex h-full min-h-0 w-full">
      <aside aria-hidden={desktopCollapsed} className={`hidden shrink-0 overflow-hidden bg-white xl:block ${desktopCollapsed ? "w-0 border-r-0 border-transparent" : "w-[280px] border-r border-slate-200"}`}>
        <div className={`h-full w-[280px] overflow-y-auto px-5 py-6 ${desktopCollapsed ? "pointer-events-none opacity-0" : "opacity-100"}`}>{navigation}</div>
      </aside>
      {mobileOpen ? <div className="fixed inset-0 z-50 xl:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/35" onClick={() => setMobileOpen(false)} /><aside className="relative h-full w-[290px] overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 shadow-2xl"><button className="ml-auto block rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600" onClick={() => setMobileOpen(false)}>Close</button><div className="mt-4">{navigation}</div></aside></div> : null}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[72px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <button aria-label="Open navigation" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 xl:hidden" onClick={() => setMobileOpen(true)}><MenuIcon className="h-5 w-5" /></button>
            <button aria-label={desktopCollapsed ? "Show navigation" : "Hide navigation"} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 xl:inline-flex" onClick={toggleDesktopNavigation}><SidebarIcon className="h-5 w-5" /></button>
            <div className="min-w-0">{eyebrow ? <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-700">{eyebrow}</p> : null}<h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h1></div>
          </div>
          {headerNavigation ? <div className="min-w-0 flex-1 border-l border-slate-200 pl-4">{headerNavigation}</div> : <div className="flex-1" />}
        </header>
        <div className={`min-h-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 ${lockContent ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}>{children}</div>
      </section>
    </div>
  </main>;
}

function HexLogoIcon(props: SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}><rect x="1" y="1" width="38" height="38" rx="12" fill="#0f172a"/><path d="M12 13h16v4H17v4h9v4h-9v4h11" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function MenuIcon(props: SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>; }
function SidebarIcon(props: SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16"/></svg>; }
