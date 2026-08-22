import { RoofsPage } from "@/features/roofs/components/RoofsPage";

export default function Page({ params }: { params: { projectId: string } }) {
  return <RoofsPage projectId={params.projectId} />;
}

