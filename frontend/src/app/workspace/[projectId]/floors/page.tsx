import { FloorsPage } from "@/features/floors/components/FloorsPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <FloorsPage projectId={params.projectId} />;
}
