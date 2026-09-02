import { ReviewClassificationPage } from "@/features/review/components/ReviewClassificationPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <ReviewClassificationPage projectId={params.projectId} />;
}
