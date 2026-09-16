import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#eef3f8]">{children}</div>;
}
