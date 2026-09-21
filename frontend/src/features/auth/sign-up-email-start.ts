// Clerk reports form_identifier_exists both when a User already owns the
// email and when this client's in-progress SignUp already holds it. The
// second case is not an account — it's the current attempt (back from the
// code step, a refresh, an abandoned start). Calling update() with the
// same email is what triggers the false "you already have an account".

export type SignUpEmailState = {
  status?: string | null;
  emailAddress?: string | null;
};

export function emailsMatch(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function canContinuePendingSignUp(signUp: SignUpEmailState, email: string): boolean {
  return signUp.status === "missing_requirements" && emailsMatch(signUp.emailAddress, email);
}
