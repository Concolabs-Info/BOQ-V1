import { BoqSetupPage } from "@/features/boq/components/BoqSetupPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <BoqSetupPage projectId={params.projectId} />;
}
