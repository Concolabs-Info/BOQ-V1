import { SpecificationsPage } from "@/features/specifications/components/SpecificationsPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <SpecificationsPage projectId={params.projectId} />;
}
