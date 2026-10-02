import { NormPage } from "@/features/norms/NormPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <NormPage projectId={params.projectId} />;
}
