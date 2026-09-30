import { redirect } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(appRoutes.workspaceRateBreakdown(projectId));
}
