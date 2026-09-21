import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { appRoutes } from "@/shared/constants/appRoutes";

export default async function HomePage() {
  const { userId } = await auth();
  redirect(userId ? appRoutes.projects : appRoutes.login);
}
