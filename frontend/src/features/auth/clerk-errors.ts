import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

export function thrownErrText(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first?.longMessage ?? first?.message ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

export const isDevInstance = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ?? false;
