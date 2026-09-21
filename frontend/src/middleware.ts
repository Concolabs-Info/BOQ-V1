import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
  "/forgot-password(.*)",
  "/help(.*)",
  "/legal(.*)",
  "/api/legal(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Plain auth.protect(), no unauthenticatedUrl override: Clerk redirects
  // via NEXT_PUBLIC_CLERK_SIGN_IN_URL itself and can complete its dev-instance
  // session handshake first. A hardcoded unauthenticatedUrl bypasses that
  // handshake and produces a permanent /sign-in <-> protected-route redirect
  // loop for a session Clerk's client SDK considers valid but the server
  // hasn't handshaken yet. quanto-onboard's middleware uses this same plain
  // form and does not hit the loop.
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
