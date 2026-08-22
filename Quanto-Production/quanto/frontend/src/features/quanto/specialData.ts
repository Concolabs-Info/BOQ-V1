import type { CapFamily,Flight,FlightFamily,Pile,PileCap,PileFamily,RailFamily } from "./specialTypes";

export const FLIGHT_FAMILIES:FlightFamily[]=[
 {id:"STAIR-DOGLEG",mark:"RCC stair",description:"Enclosed dog-leg stair with intermediate landing",kind:"Stair",widthMm:1219,riserMm:0,treadMm:0,waistMm:0,finish:"F06",source:"AR/01–AR/03 central stair core; construction dimensions/detail not provided",color:"#7c3aed"},
];
export const RAIL_FAMILIES:RailFamily[]=[{id:"STAIR-RAIL-TBC",mark:"Rail TBC",description:"Stair handrail / balustrade detail not provided",heightMm:0,source:"Not shown in supplied architectural or structural details",color:"#f59e0b"}];
const stairOutline=(id:string,floorId:string,viewportId:string):Flight=>({
 id,familyId:"STAIR-DOGLEG",railFamilyId:"STAIR-RAIL-TBC",floorId,viewportId,
 // The outline follows the two flights and their intermediate landing in the central core.
 // Top and bottom floor landings remain owned by Slab/Floor, not this element.
 points:[{x:695,y:1035},{x:910,y:1035},{x:910,y:1160},{x:695,y:1160}],
 voids:[],railEdges:[false,false,false,false],status:"needs_review"
});
export const FLIGHTS:Flight[]=[
 stairOutline("STAIR-GF-TO-FF","GF","VP-GROUND"),
 stairOutline("STAIR-FF-TO-L02","FF","VP-FIRST"),
 stairOutline("STAIR-TYPICAL","TYP","VP-TYP"),
 {...stairOutline("STAIR-ROOF-TERRACE-EVIDENCE","RF","VP-TERRACE"),evidenceOnly:true,linkedFlightId:"STAIR-TYPICAL"},
];

// AR/10 contains rubble wall-foundation and generic Type I/II pad-footing details,
// but no pile layout, pile schedule, pile lengths or pile-cap schedule. This child
// is therefore intentionally empty rather than seeding unsupported quantities.
export const PILE_FAMILIES:PileFamily[]=[];
export const CAP_FAMILIES:CapFamily[]=[];
export const PILES:Pile[]=[];
export const CAPS:PileCap[]=[];
