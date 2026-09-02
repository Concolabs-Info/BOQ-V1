import { redirect } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

export default function Page({ params }: { params: { projectId: string } }) {
  redirect(appRoutes.takeoff(params.projectId, "roof", "dimension"));
}
