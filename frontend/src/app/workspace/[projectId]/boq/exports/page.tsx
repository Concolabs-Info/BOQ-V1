import { BoqExportsPage } from "@/features/boq/components/BoqExportsPage";

export default function Page({ params }: { params: { projectId: string } }) {
  return <BoqExportsPage projectId={params.projectId} />;
}
