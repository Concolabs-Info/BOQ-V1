import { WallsPage } from "@/features/walls/components/WallsPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <WallsPage projectId={params.projectId} />;
}
