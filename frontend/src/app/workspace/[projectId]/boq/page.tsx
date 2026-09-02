import { BoqPage } from "@/features/boq/components/BoqPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <BoqPage projectId={params.projectId} />;
}
