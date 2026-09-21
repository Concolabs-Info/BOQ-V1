import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { MarkdownDoc } from "@/features/legal/MarkdownDoc";
import { loadTermsDocument } from "@/features/legal/loadTerms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms of Service · Quanto" };

export default function TermsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const terms = loadTermsDocument();
  return (
    <LegalPage title={terms.title} searchParams={searchParams}>
      <MarkdownDoc markdown={terms.markdown} />
    </LegalPage>
  );
}
