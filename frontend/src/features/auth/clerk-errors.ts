import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { CLERK_PASSWORD_MIN_LENGTH } from "./password";

// Clerk's own wording is written for a generic app and sometimes references
// options this UI doesn't actually offer (e.g. "or use another method" when
// none is shown), or just reads more like an API log line than something a
// person should see. Swap in a friendlier line for every error code our
// flows can actually hit (sign-in, sign-up, password reset, invite tickets,
// MFA) — cross-checked against Clerk's own list of error codes so nothing
// reachable here gets skipped. Anything not listed still falls back to
// Clerk's own message, so an unmapped code never goes silent; codes for
// features we don't use (passkeys, web3, organizations, avatars, phone
// numbers, usernames) are deliberately left unmapped since they can't occur.
const FRIENDLY_MESSAGES: Record<string, string> = {
  // Wrong credentials
  form_identifier_not_found: "We couldn't find an account with that email.",
  form_password_incorrect: "That password doesn't look right. Want to try again, or reset it?",
  form_password_or_identifier_incorrect: "That email and password don't match. Check them, or reset your password.",
  form_code_incorrect: "That code didn't match. Double-check it, or request a new one.",

  // Password quality/safety
  form_password_pwned: "That password has shown up in a data breach elsewhere, so we can't use it. Pick a different one to keep your account safe.",
  form_password_pwned__sign_in: "That password has shown up in a data breach elsewhere. Reset it before continuing, to keep your account safe.",
  form_password_compromised__sign_in: "That password isn't safe to use anymore. Reset it before continuing.",
  form_password_untrusted__sign_in: "We couldn't confirm that password is safe to use right now. Try resetting it.",
  form_password_not_strong_enough: "That password's a bit too easy to guess. Try adding more length or variety.",
  form_password_length_too_short: `Use at least ${CLERK_PASSWORD_MIN_LENGTH} characters.`,
  form_password_validation_failed: "That password isn't valid. Try a different one.",
  form_new_password_matches_current: "That's your current password. Choose a new one.",
  form_password_matches_identifier: "Your password can't be the same as your email.",

  // Email address issues
  form_param_format_invalid__email_address: "That doesn't look like a valid email address.",
  form_param_format_invalid: "One of those doesn't look right. Please check and try again.",
  form_email_address_blocked: "We can't use that email address. Try a different one.",
  form_identifier_exists: "That email's already in use. Try signing in instead.",
  form_identifier_exists__email_address: "That email's already in use. Try signing in instead.",

  // Invitations
  ticket_expired_code: "This invitation has expired. Ask whoever invited you to send a new one.",
  ticket_invalid_code: "That invitation link isn't valid. Ask whoever invited you to send a new one.",

  // Bot protection / access
  captcha_invalid: "That security check didn't pass. Refresh the page and try again.",
  captcha_unavailable: "We couldn't load the security check. Refresh the page and try again.",
  not_allowed_access: "This email isn't allowed to sign up here. Check with whoever invited you.",
  action_blocked: "We couldn't complete that for security reasons. Try again in a moment.",

  session_exists: "You're already signed in.",
};

export function thrownErrText(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    if (first?.code && FRIENDLY_MESSAGES[first.code]) return FRIENDLY_MESSAGES[first.code];
    return first?.longMessage ?? first?.message ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

const IDENTIFIER_EXISTS_CODES = new Set([
  "form_identifier_exists",
  "form_identifier_exists__email_address",
  "form_identifier_exists__username",
  "form_identifier_exists__phone_number",
]);

// Distinct from thrownErrText: this one case gets its own UI (a message
// with an actual "Sign in" link) instead of a plain error string, since
// "you already have an account" is an action, not just a failure.
export function isAccountExistsError(err: unknown): boolean {
  return isClerkAPIResponseError(err) && Boolean(err.errors[0]?.code && IDENTIFIER_EXISTS_CODES.has(err.errors[0].code));
}

export const isDevInstance = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ?? false;
