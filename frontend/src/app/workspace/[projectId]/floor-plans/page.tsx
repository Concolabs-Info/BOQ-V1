import { FloorPlansPage } from "@/features/floor-plans/components/FloorPlansPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <FloorPlansPage projectId={params.projectId} />;
}
