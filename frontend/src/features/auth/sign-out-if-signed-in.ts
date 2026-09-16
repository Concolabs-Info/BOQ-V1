export async function signOutIfSignedIn(clerk: {
  session: unknown;
  signOut: (callback?: () => void) => Promise<unknown>;
}): Promise<boolean> {
  if (!clerk.session) return false;
  await clerk.signOut(() => undefined);
  return true;
}
