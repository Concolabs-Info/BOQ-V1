import { RateBreakdownPage } from "@/features/rate-breakdown/RateBreakdownPage";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <RateBreakdownPage projectId={projectId} />;
}
