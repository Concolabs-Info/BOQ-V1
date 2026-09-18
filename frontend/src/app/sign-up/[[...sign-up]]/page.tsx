import { redirect } from "next/navigation";
import { SignUpForm } from "@/features/auth/components/SignUpForm";
import { firstParam } from "@/features/auth/url";
import { appRoutes } from "@/shared/constants/appRoutes";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ticket = firstParam(params.__clerk_ticket);
  const status = firstParam(params.__clerk_status);

  if (ticket && status === "sign_in") {
    redirect(`/sign-in?${new URLSearchParams({ __clerk_ticket: ticket, __clerk_status: status })}`);
  }
  if (ticket && status === "complete") redirect(appRoutes.projects);

  return <SignUpForm invitationTicket={ticket} />;
}
