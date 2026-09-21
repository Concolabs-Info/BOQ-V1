import { Suspense } from "react";
import { SsoCallback } from "@/features/auth/components/SsoCallback";

export default function SignUpSsoCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SsoCallback intent="sign-up" />
    </Suspense>
  );
}
