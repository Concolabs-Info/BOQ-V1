import { BoqExportsPage } from "@/features/boq/components/BoqExportsPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <BoqExportsPage projectId={params.projectId} />;
}
