import "../styles/tokens.css";
import "../styles/globals.css";
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { ClerkSessionBridge } from "@/features/auth/components/ClerkSessionBridge";
import { RememberReturnPath } from "@/features/legal/RememberReturnPath";
import { CompanyGate } from "@/features/onboarding/components/CompanyGate";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Quanto",
  description: "Interactive construction takeoff and BOQ production"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/sign-in"
          signInFallbackRedirectUrl="/projects"
          signUpFallbackRedirectUrl="/onboarding"
        >
          <ClerkSessionBridge>
            <QueryProvider>
              <LocaleProvider>
                <Suspense fallback={null}>
                  <RememberReturnPath />
                </Suspense>
                <CompanyGate>{children}</CompanyGate>
              </LocaleProvider>
            </QueryProvider>
          </ClerkSessionBridge>
        </ClerkProvider>
      </body>
    </html>
  );
}
