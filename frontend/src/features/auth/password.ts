export const CLERK_PASSWORD_MIN_LENGTH = 15;

export function passwordLengthPlaceholder(min = CLERK_PASSWORD_MIN_LENGTH) {
  return `At least ${min} characters`;
}

export function passwordLengthHint(min = CLERK_PASSWORD_MIN_LENGTH) {
  return `Use at least ${min} characters.`;
}

// 0 = empty, 1 = weak, 2 = fair, 3 = good, 4 = strong.
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function passwordStrength(password: string, min = CLERK_PASSWORD_MIN_LENGTH): PasswordStrength {
  if (!password) return 0;

  let score = 0;
  if (password.length >= min) score += 1;
  if (password.length >= min + 6) score += 1;

  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (varietyCount >= 2) score += 1;
  if (varietyCount >= 3) score += 1;

  return Math.min(score, 4) as PasswordStrength;
}

export function passwordStrengthLabel(strength: PasswordStrength): string {
  return ["", "Weak", "Fair", "Good", "Strong"][strength];
}
