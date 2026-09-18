export const CLERK_PASSWORD_MIN_LENGTH = 15;

export function passwordLengthPlaceholder(min = CLERK_PASSWORD_MIN_LENGTH) {
  return `At least ${min} characters`;
}

export function passwordLengthHint(min = CLERK_PASSWORD_MIN_LENGTH) {
  return `Use at least ${min} characters.`;
}
