import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-fit-viewport className="h-dvh max-h-dvh overflow-hidden bg-[#eef3f8]">
      {children}
    </div>
  );
}
