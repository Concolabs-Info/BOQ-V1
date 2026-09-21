import { RateFilesPage } from "@/features/rate-files/RateFilesPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <RateFilesPage projectId={params.projectId} />;
}
