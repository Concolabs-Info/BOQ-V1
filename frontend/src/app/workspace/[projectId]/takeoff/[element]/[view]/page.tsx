import { TakeoffPage } from "@/features/quanto/TakeoffPage";
export default function Page({params}:{params:{projectId:string;element:string;view:string}}){return <TakeoffPage projectId={params.projectId} element={params.element} view={params.view}/>;}
