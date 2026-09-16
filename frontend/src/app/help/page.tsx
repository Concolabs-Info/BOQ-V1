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
        <li>
          Sign up with your work email. Clerk only creates your login. After that, Quanto asks you to create or join a
          company in our database.
        </li>
        <li>If your company is already on Quanto, you&apos;ll be offered a request to join instead of creating a new one.</li>
        <li>Not registered yet? Choose &ldquo;Not registered yet&rdquo; during setup. You can add your PV or BR number later in Company Settings.</li>
        <li>Country sets your BOQ currency (Sri Lanka defaults to LKR).</li>
      </ul>

      <h2>Inviting your team</h2>
      <ul>
        <li>Invites go out by Clerk email with a role stored on our invitation row. They join your company after they sign up with that address.</li>
        <li>Only owners and admins can invite or change roles.</li>
        <li>Pending invites can be resent or revoked from the members list.</li>
      </ul>

      <h2>Roles</h2>
      <p>
        Built-in and custom roles live in Postgres. Clerk is not used for role management. Site engineers and viewers
        only see projects you assign them to.
      </p>
    </LegalPage>
  );
}
