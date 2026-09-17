import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";

export const metadata: Metadata = { title: "Help Center · Quanto" };

export default function HelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LegalPage title="Help Center" searchParams={searchParams}>
      <p>
        Quick answers for getting your team onto Quanto. Still stuck? Email{" "}
        <a href="mailto:support@quanto.app">support@quanto.app</a>.
      </p>

      <h2>Setting up your company</h2>
      <ul>
        <li>Sign up with your work email. You&apos;ll create a company, or request to join one that&apos;s already on Quanto.</li>
        <li>If your company is already on Quanto, you&apos;ll be asked to request access instead of creating a new one.</li>
        <li>Not registered yet? Choose &ldquo;Not registered yet&rdquo; during setup. You can add your PV or BR number later in Company Settings.</li>
        <li>Country sets your BOQ currency (Sri Lanka defaults to LKR).</li>
      </ul>

      <h2>Inviting your team</h2>
      <ul>
        <li>Enter someone&apos;s email and pick a role. They&apos;ll get a link to join your company.</li>
        <li>Only owners and admins can invite people or change roles.</li>
        <li>You can resend or cancel a pending invite from the members list.</li>
      </ul>

      <h2>Roles</h2>
      <p>
        Built-in roles cover the usual jobs on a team. You can add your own — technician, site engineer, viewer, and so
        on — under Settings → Roles.
      </p>
    </LegalPage>
  );
}
