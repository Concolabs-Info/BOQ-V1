import { Suspense } from "react";
import { SsoCallback } from "@/features/auth/components/SsoCallback";

export default function SignInSsoCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SsoCallback intent="sign-in" />
    </Suspense>
  );
}
