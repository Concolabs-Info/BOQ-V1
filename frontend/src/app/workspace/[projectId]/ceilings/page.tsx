import { CeilingsPage } from "@/features/ceilings/components/CeilingsPage";

export default function Page({ params }: { params: { projectId: string } }) {
  return <CeilingsPage projectId={params.projectId} />;
}
