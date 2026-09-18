import { clearAllCachedJson } from "@/shared/services/apiClient";

export function hardNavigate(path: string): void {
  window.location.assign(path);
}

type SignOutClerk = { signOut: (callback?: () => void) => Promise<unknown> };

export function signOutAndGo(clerk: SignOutClerk, path = "/sign-in"): Promise<unknown> {
  return clerk.signOut(() => {
    clearAllCachedJson();
    hardNavigate(path);
  });
}
