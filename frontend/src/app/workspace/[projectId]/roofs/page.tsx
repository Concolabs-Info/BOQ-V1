import { redirect } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

export default async function Page(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  redirect(appRoutes.takeoff(params.projectId, "roof", "dimension"));
}
