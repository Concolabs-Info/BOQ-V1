import "../styles/tokens.css";
import "../styles/globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { ClerkSessionBridge } from "@/features/auth/components/ClerkSessionBridge";
import { RememberReturnPath } from "@/features/legal/RememberReturnPath";
import { CompanyGate } from "@/features/onboarding/components/CompanyGate";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Quanto",
  description: "Interactive construction takeoff and BOQ production"
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
              <Suspense fallback={null}>
                <RememberReturnPath />
              </Suspense>
              <CompanyGate>{children}</CompanyGate>
            </QueryProvider>
          </ClerkSessionBridge>
        </ClerkProvider>
      </body>
    </html>
  );
}
