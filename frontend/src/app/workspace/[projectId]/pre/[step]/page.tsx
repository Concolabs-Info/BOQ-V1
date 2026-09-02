import { HeightStage } from "@/features/pre/height";
import { PlansStage } from "@/features/pre/plans";
import { ScaleStage } from "@/features/pre/scale";
import { SpecificationsStage } from "@/features/pre/specifications";
import { StartTakeoffStage } from "@/features/pre/start-takeoff";
import { UploadStage } from "@/features/pre/upload";

export default async function Page(props0: { params: Promise<{ projectId: string; step: string }> }) {
  const params = await props0.params;
  const props = { projectId: params.projectId };

  switch (params.step) {
    case "upload":
      return <UploadStage {...props} />;
    case "plans":
      return <PlansStage {...props} />;
    case "scale":
      return <ScaleStage {...props} />;
    case "height":
      return <HeightStage {...props} />;
    case "specifications":
      return <SpecificationsStage {...props} />;
    default:
      return <StartTakeoffStage {...props} />;
  }
}
