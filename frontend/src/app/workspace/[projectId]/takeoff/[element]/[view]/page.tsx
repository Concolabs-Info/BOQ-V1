import { TakeoffPage } from "@/features/quanto/TakeoffPage";
export default async function Page(props:{params: Promise<{projectId:string;element:string;view:string}>}) {
  const params = await props.params;
  return <TakeoffPage projectId={params.projectId} element={params.element} view={params.view}/>;
}
