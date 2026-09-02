import { ReviewPage } from "@/features/review/components/ReviewPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <ReviewPage projectId={params.projectId} />;
}
