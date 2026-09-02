import { ScalePage } from "@/features/scale/components/ScalePage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <ScalePage projectId={params.projectId} />;
}
