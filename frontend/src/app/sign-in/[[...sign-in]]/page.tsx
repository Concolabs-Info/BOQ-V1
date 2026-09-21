import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInForm } from "@/features/auth/components/SignInForm";
import { firstParam, safeInternalPath } from "@/features/auth/url";
import { appRoutes } from "@/shared/constants/appRoutes";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectUrl = safeInternalPath(params.redirect_url);
  const ticket = firstParam(params.__clerk_ticket);
  const status = firstParam(params.__clerk_status);
  const wantsSwitch = firstParam(params.switch) === "1";
  const initialEmail = firstParam(params.email);

  if (ticket && status === "sign_up") {
    redirect(`/sign-up?${new URLSearchParams({ __clerk_ticket: ticket, __clerk_status: status })}`);
  }
  if (ticket && status === "complete") redirect(appRoutes.projects);

  const { userId } = await auth();
  if (userId && !ticket && !wantsSwitch) {
    redirect(redirectUrl ?? appRoutes.projects);
  }

  return (
    <Suspense fallback={null}>
      <SignInForm redirectUrl={redirectUrl} invitationTicket={ticket} switchAccount={wantsSwitch} initialEmail={initialEmail} />
    </Suspense>
  );
}
