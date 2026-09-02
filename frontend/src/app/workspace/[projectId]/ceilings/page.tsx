import { CeilingsPage } from "@/features/ceilings/components/CeilingsPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <CeilingsPage projectId={params.projectId} />;
}
