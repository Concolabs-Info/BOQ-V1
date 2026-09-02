import { ModelReviewPage } from "@/features/model-review/components/ModelReviewPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <ModelReviewPage projectId={params.projectId} />;
}
