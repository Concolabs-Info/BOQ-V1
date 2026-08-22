import type { BBox, DemoStatus, Point } from "@/features/demo/types";

export type SpecialElement="stairs-ramps"|"foundation";

export type FlightFamily={id:string;mark:string;description:string;kind:"Stair"|"Ramp";widthMm:number;riserMm:number;treadMm:number;waistMm:number;finish:string;source:string;color:string};
export type RailFamily={id:string;mark:string;description:string;heightMm:number;source:string;color:string};
export type Flight={id:string;familyId:string;railFamilyId:string;floorId:string;viewportId:string;points:Point[];voids:Point[][];railEdges:boolean[];riseOverrideM?:number;evidenceOnly?:boolean;linkedFlightId?:string;status:DemoStatus};

export type PileFamily={id:string;mark:string;description:string;method:string;diameterMm:number;grade:string;reinforcement:string;source:string;color:string};
export type CapFamily={id:string;mark:string;description:string;widthMm:number;depthMm:number;thicknessMm:number;source:string;color:string};
export type Pile={id:string;familyId:string;floorId:string;viewportId:string;bbox:BBox;hostColumnId?:string;lengthM:number;commencingLevelM:number;toeLevelM:number;status:DemoStatus};
export type PileCap={id:string;familyId:string;floorId:string;viewportId:string;bbox:BBox;hostPileIds:string[];thicknessOverrideMm?:number;status:DemoStatus};
