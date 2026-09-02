import "../styles/tokens.css";
import "../styles/globals.css";
import type { Metadata } from "next";
import { QueryProvider } from "@/shared/providers/QueryProvider";

export const metadata: Metadata = {
  title: "Quanto",
  description: "Interactive construction takeoff and BOQ production"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><QueryProvider>{children}</QueryProvider></body></html>;
}
