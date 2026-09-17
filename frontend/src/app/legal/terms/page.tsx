import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Quanto" };

export default function TermsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LegalPage title="Terms of Service" updated="16 September 2026" searchParams={searchParams}>
      <p>
        These terms govern your use of Quanto, a hosted tool for automated bill of quantities (BOQ) takeoff. By
        creating a company or joining one, you agree to them on behalf of that company.
      </p>

      <h2>Accounts and companies</h2>
      <ul>
        <li>
          Sign-in is handled by Clerk. A company on Quanto is stored in our database, not as a Clerk Organization.
        </li>
        <li>One company on Quanto represents one construction firm. You may not create duplicate companies for the same firm.</li>
        <li>You are responsible for keeping your sign-in credentials secure and for activity under your account.</li>
        <li>
          A company owner controls membership, roles, and project access. Removing a member ends their access but
          preserves their past work.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        Drawings, schedules, rates, and BOQ data you upload remain yours. You grant Quanto the licence needed to store
        and process them so the product can function. We do not sell your project data.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload content you have no right to share.</li>
        <li>Do not attempt to disrupt the service or access other companies&apos; data.</li>
        <li>Estimates produced by Quanto are a starting point, not professional advice. Review them before relying on them.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:legal@quanto.app">legal@quanto.app</a>.
      </p>
    </LegalPage>
  );
}
