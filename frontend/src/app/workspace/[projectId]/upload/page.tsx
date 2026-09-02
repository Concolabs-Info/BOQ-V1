import { UploadPage } from "@/features/upload/components/UploadPage";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <UploadPage projectId={params.projectId} />;
}
