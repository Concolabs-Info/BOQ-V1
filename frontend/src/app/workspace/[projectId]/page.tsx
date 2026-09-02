import { ProjectOverviewPage } from "@/features/project-overview/components/ProjectOverviewPage";

export default async function WorkspacePage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  return <ProjectOverviewPage projectId={params.projectId} />;
}
