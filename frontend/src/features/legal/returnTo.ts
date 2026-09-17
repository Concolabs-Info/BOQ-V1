import { firstParam, safeInternalPath } from "@/features/auth/url";

export const RETURN_TO_KEY = "quanto:return-to";

export function isHelpOrLegalPath(path: string) {
  const pathname = path.split("?")[0] ?? "";
  return pathname === "/help" || pathname.startsWith("/help/") || pathname === "/legal" || pathname.startsWith("/legal/");
}

export function safeReturnPath(value: string | string[] | undefined): string | undefined {
  const path = safeInternalPath(value);
  if (!path || isHelpOrLegalPath(path)) return undefined;
  return path;
}

export function backLabel(href: string) {
  const pathname = href.split("?")[0] ?? "";
  if (pathname.startsWith("/sign-up")) return "Back to sign up";
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/login") || pathname.startsWith("/forgot-password")) {
    return "Back to sign in";
  }
  if (pathname.startsWith("/onboarding/terms")) return "Back to terms";
  if (pathname.startsWith("/onboarding")) return "Back to setup";
  if (pathname.startsWith("/account")) return "Back to account";
  if (pathname.startsWith("/organization")) return "Back to settings";
  if (pathname.startsWith("/projects")) return "Back to projects";
  if (pathname.startsWith("/workspace")) return "Back to workspace";
  return "Back";
}

export function resolveLegalBack(from: string | string[] | undefined): { href: string; label: string } {
  const key = firstParam(from);
  if (key === "sign-up") return { href: "/sign-up", label: "Back to sign up" };
  if (key === "sign-in") return { href: "/sign-in", label: "Back to sign in" };
  if (key === "onboarding") return { href: "/onboarding", label: "Back to setup" };

  const href = safeReturnPath(from);
  if (href) return { href, label: backLabel(href) };
  return { href: "/sign-in", label: "Back to sign in" };
}

export function currentReturnTo(pathname: string, search: string) {
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function helpHref(returnTo: string) {
  return `/help?from=${encodeURIComponent(returnTo)}`;
}

export function termsHref(returnTo: string) {
  return `/legal/terms?from=${encodeURIComponent(returnTo)}`;
}
