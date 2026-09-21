import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { MarkdownDoc } from "@/features/legal/MarkdownDoc";
import { loadPrivacyDocument } from "@/features/legal/loadPrivacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy Policy · Quanto" };

export default function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const privacy = loadPrivacyDocument();
  return (
    <LegalPage title={privacy.title} searchParams={searchParams}>
      <MarkdownDoc markdown={privacy.markdown} />
    </LegalPage>
  );
}
