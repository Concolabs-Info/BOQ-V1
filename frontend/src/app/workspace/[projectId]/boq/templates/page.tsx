import { BoqTemplatesPage } from "@/features/boq/components/BoqTemplatesPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <BoqTemplatesPage projectId={params.projectId} />;
}
