import "../styles/tokens.css";
import "../styles/globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { ClerkSessionBridge } from "@/features/auth/components/ClerkSessionBridge";

export const metadata: Metadata = {
  title: "Quanto",
  description: "Interactive construction takeoff and BOQ production"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/sign-in">
          <ClerkSessionBridge>
            <QueryProvider>{children}</QueryProvider>
          </ClerkSessionBridge>
        </ClerkProvider>
      </body>
    </html>
  );
}
