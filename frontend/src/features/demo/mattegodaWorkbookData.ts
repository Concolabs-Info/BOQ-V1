export type WorkbookSourceStatus =
  | "CONFIRMED"
  | "UNVERIFIED"
  | "DISPUTED"
  | "PROVISIONAL"
  | "PRELIMINARY"
  | "CONTROL"
  | "TBC";

export type ImportedOpeningSchedule = {
  ref: string;
  kind: "door" | "window";
  location: string;
  widthMm: number;
  heightMm: number;
  scheduledQty: number;
  floorsOneToSixQty: number;
  status: WorkbookSourceStatus;
  provisionalHost: "225" | "115" | "Excluded";
  description: string;
  material: string;
  note: string;
};

export const MATTEGODA_OPENING_SCHEDULE: ImportedOpeningSchedule[] = [
  { ref:"D1",kind:"door",location:"Entrance",widthMm:1219.2,heightMm:2133.6,scheduledQty:36,floorsOneToSixQty:36,status:"CONFIRMED",provisionalHost:"225",description:"Timber panelled entrance door",material:"Timber",note:"First–sixth floors." },
  { ref:"D2",kind:"door",location:"Bedroom",widthMm:914.4,heightMm:2133.6,scheduledQty:72,floorsOneToSixQty:72,status:"CONFIRMED",provisionalHost:"115",description:"Timber framed solid bedroom door",material:"Timber",note:"First–sixth floors." },
  { ref:"D2'",kind:"door",location:"Garbage room",widthMm:914.4,heightMm:2438.4,scheduledQty:1,floorsOneToSixQty:0,status:"UNVERIFIED",provisionalHost:"Excluded",description:"Timber framed solid garbage-room door",material:"Timber",note:"Ground floor only; fire/performance rating to be confirmed." },
  { ref:"D3",kind:"door",location:"Toilets",widthMm:838.2,heightMm:2133.6,scheduledQty:72,floorsOneToSixQty:72,status:"CONFIRMED",provisionalHost:"115",description:"Timber framed solid toilet door",material:"Timber",note:"First–sixth floors." },
  { ref:"D5",kind:"door",location:"Disabled toilet",widthMm:990.6,heightMm:2438.4,scheduledQty:0,floorsOneToSixQty:0,status:"CONFIRMED",provisionalHost:"Excluded",description:"Timber framed disabled-toilet door",material:"Timber",note:"Scheduled type with zero quantity." },
  { ref:"D6",kind:"door",location:"Duct",widthMm:609.6,heightMm:1828.8,scheduledQty:86,floorsOneToSixQty:84,status:"CONFIRMED",provisionalHost:"115",description:"Aluminium framed composite-panel duct door",material:"Aluminium / composite panel",note:"84 on floors 1–6 plus 2 at roof terrace." },
  { ref:"D7",kind:"door",location:"Duct",widthMm:1219.2,heightMm:1828.8,scheduledQty:15,floorsOneToSixQty:12,status:"DISPUTED",provisionalHost:"115",description:"Aluminium framed composite-panel duct door",material:"Aluminium / composite panel",note:"12 on floors 1–6; balance at ground/roof." },
  { ref:"D8",kind:"door",location:"Duct",widthMm:863.6,heightMm:1828.8,scheduledQty:1,floorsOneToSixQty:0,status:"UNVERIFIED",provisionalHost:"Excluded",description:"Aluminium framed composite-panel duct door",material:"Aluminium / composite panel",note:"Ground-floor item." },
  { ref:"GD",kind:"door",location:"Panel room",widthMm:1219.2,heightMm:2438.4,scheduledQty:1,floorsOneToSixQty:0,status:"CONFIRMED",provisionalHost:"Excluded",description:"G.I. gate to panel room",material:"Galvanized iron",note:"Ground-floor service area." },
  { ref:"RD",kind:"door",location:"Transformer room",widthMm:2438.4,heightMm:2438.4,scheduledQty:1,floorsOneToSixQty:0,status:"UNVERIFIED",provisionalHost:"Excluded",description:"Roller shutter door",material:"Metal roller shutter",note:"Specialist requirements to be confirmed." },
  { ref:"FG",kind:"window",location:"Staircase",widthMm:2438.4,heightMm:2438.4,scheduledQty:6,floorsOneToSixQty:6,status:"DISPUTED",provisionalHost:"225",description:"Aluminium framed glazed staircase window",material:"Aluminium / glass",note:"Schedule/plan reconciliation pending." },
  { ref:"FG1",kind:"window",location:"Staircase lobby",widthMm:1219.2,heightMm:2438.4,scheduledQty:12,floorsOneToSixQty:12,status:"CONFIRMED",provisionalHost:"225",description:"Aluminium framed glazed staircase-lobby window",material:"Aluminium / glass",note:"First–sixth floors." },
  { ref:"SL",kind:"window",location:"Lobby",widthMm:1828.8,heightMm:2438.4,scheduledQty:2,floorsOneToSixQty:0,status:"DISPUTED",provisionalHost:"Excluded",description:"Aluminium framed sliding lobby window",material:"Aluminium / glass",note:"Roof-terrace item." },
  { ref:"SL1",kind:"window",location:"Living, dining and pantry",widthMm:1879.6,heightMm:2438.4,scheduledQty:12,floorsOneToSixQty:12,status:"CONFIRMED",provisionalHost:"225",description:"Aluminium framed sliding window",material:"Aluminium / glass",note:"First–sixth floors." },
  { ref:"SL2",kind:"window",location:"Gym / condominium room",widthMm:3048,heightMm:2438.4,scheduledQty:8,floorsOneToSixQty:0,status:"CONFIRMED",provisionalHost:"Excluded",description:"Aluminium framed sliding window",material:"Aluminium / glass",note:"Roof-terrace item." },
  { ref:"FW1",kind:"window",location:"Living, dining and pantry",widthMm:1524,heightMm:2438.4,scheduledQty:24,floorsOneToSixQty:24,status:"CONFIRMED",provisionalHost:"225",description:"Aluminium framed French window",material:"Aluminium / glass",note:"First–sixth floors." },
  { ref:"FW2",kind:"window",location:"Bedroom",widthMm:1295.4,heightMm:2438.4,scheduledQty:72,floorsOneToSixQty:72,status:"DISPUTED",provisionalHost:"225",description:"Aluminium framed French window",material:"Aluminium / glass",note:"Printed schedule 72; plan implication 73; 72 retained." },
  { ref:"LW",kind:"window",location:"Toilet",widthMm:609.6,heightMm:2438.4,scheduledQty:72,floorsOneToSixQty:72,status:"DISPUTED",provisionalHost:"225",description:"Aluminium framed louvered window",material:"Aluminium / louvre",note:"Schedule/plan reconciliation pending." },
  { ref:"LW1",kind:"window",location:"Water tank",widthMm:3124.2,heightMm:2133.6,scheduledQty:1,floorsOneToSixQty:0,status:"DISPUTED",provisionalHost:"Excluded",description:"Aluminium framed louvered window",material:"Aluminium / louvre",note:"Roof/water-tank item." },
];

export type ImportedMasonryRow = {
  key: string; scope: string; floorId: "FF" | "TYP"; thicknessMm: 225 | 115;
  familyLabel: string; centrelineM: number; repetition: number; heightM: number;
  grossM2: number; deductionM2: number; netM2: number; status: WorkbookSourceStatus; note: string;
};
export const MATTEGODA_MASONRY: ImportedMasonryRow[] = [
  {key:"import:masonry:FF:225",scope:"First floor",floorId:"FF",thicknessMm:225,familyLabel:"225 mm (M01/M02)",centrelineM:248.933,repetition:1,heightM:3.3528,grossM2:834.6226,deductionM2:107.2720,netM2:727.3505,status:"PROVISIONAL",note:"Opening hosts provisionally allocated by type."},
  {key:"import:masonry:FF:115",scope:"First floor",floorId:"FF",thicknessMm:115,familyLabel:"115 mm (M03/M04)",centrelineM:107.605,repetition:1,heightM:3.3528,grossM2:360.7780,deductionM2:64.9392,netM2:295.8388,status:"PROVISIONAL",note:"Internal/wet partition subtype split unresolved."},
  {key:"import:masonry:TYP:225",scope:"Second–sixth floors",floorId:"TYP",thicknessMm:225,familyLabel:"225 mm (M01/M02)",centrelineM:243.569,repetition:5,heightM:3.3528,grossM2:4083.1907,deductionM2:536.3602,netM2:3546.8305,status:"PROVISIONAL",note:"Typical-floor repetition ×5."},
  {key:"import:masonry:TYP:115",scope:"Second–sixth floors",floorId:"TYP",thicknessMm:115,familyLabel:"115 mm (M03/M04)",centrelineM:104.367,repetition:5,heightM:3.3528,grossM2:1749.6084,deductionM2:324.6961,netM2:1424.9123,status:"PROVISIONAL",note:"Typical-floor repetition ×5."},
];

export type ImportedFloorArea = {
  key:string; ref:string; scope:string; input:number; inputUnit:"m²"|"ft²"; repetition:number;
  totalM2:number; finishRef:string; status:WorkbookSourceStatus; note:string;
};
export const MATTEGODA_FLOOR_AREAS: ImportedFloorArea[] = [
  {key:"import:floor:FA-01",ref:"FA-01",scope:"Ground floor gross plan area",input:579.065,inputUnit:"m²",repetition:1,totalM2:579.065,finishRef:"F08/F05/F09 composite",status:"CONTROL",note:"Parking, lobby and service-room zones are not separated."},
  {key:"import:floor:FA-02",ref:"FA-02",scope:"First-floor apartment units",input:4914,inputUnit:"ft²",repetition:1,totalM2:456.5255,finishRef:"F01/F02/F03 composite",status:"CONTROL",note:"Includes internal finish zones and wall footprints."},
  {key:"import:floor:FA-03",ref:"FA-03",scope:"First-floor common area residual",input:646,inputUnit:"ft²",repetition:1,totalM2:60.0154,finishRef:"F04/F05",status:"PRELIMINARY",note:"Corridor/lobby split not stated."},
  {key:"import:floor:FA-04",ref:"FA-04",scope:"Typical-floor apartment units",input:4914,inputUnit:"ft²",repetition:5,totalM2:2282.6277,finishRef:"F01/F02/F03 composite",status:"CONTROL",note:"Second–sixth floors."},
  {key:"import:floor:FA-05",ref:"FA-05",scope:"Typical-floor common area residual",input:706,inputUnit:"ft²",repetition:5,totalM2:327.9477,finishRef:"F04/F05",status:"PRELIMINARY",note:"Corridor/lobby split not stated."},
  {key:"import:floor:FA-06",ref:"FA-06",scope:"Roof terrace enclosed/core area",input:1491,inputUnit:"ft²",repetition:1,totalM2:138.5184,finishRef:"F07/F01/F05 composite",status:"CONTROL",note:"Gym, management room and circulation are not separated."},
  {key:"import:floor:FA-07",ref:"FA-07",scope:"Open roof terrace",input:3840,inputUnit:"ft²",repetition:1,totalM2:356.7477,finishRef:"F10",status:"PRELIMINARY",note:"Exterior finish over protected insulated waterproofing."},
  {key:"import:floor:FA-08",ref:"FA-08",scope:"Flower trough surface",input:996,inputUnit:"ft²",repetition:1,totalM2:92.5314,finishRef:"F12/W09",status:"PRELIMINARY",note:"Root-resistant waterproofing/protection/drainage build-up."},
];

export type WorkbookAssumption = { id:string; topic:string; basis:string; impact:string; resolution:string };
export const MATTEGODA_ASSUMPTIONS: WorkbookAssumption[] = [
  {id:"measurement-standard",topic:"Measurement standard",basis:"Descriptions follow the supplied NRM2-oriented specification notes.",impact:"Work is separated by element/type where the source permits.",resolution:"Confirm project BOQ preambles and exact NRM2 edition/rules."},
  {id:"opening-counts",topic:"Door/window counts",basis:"Printed schedule/CSV counts are retained, including disputed types.",impact:"Disputed quantities remain visible.",resolution:"Reconcile the schedule against every plan tag."},
  {id:"fw2",topic:"FW2 discrepancy",basis:"72 scheduled versus 73 implied by plan tags; 72 retained.",impact:"Potential +1 window variation.",resolution:"Architect confirmation."},
  {id:"masonry-class",topic:"Masonry classification",basis:"Geometry identifies 225 mm and 115 mm groups; subtype split is unresolved.",impact:"Rates may differ by wall performance.",resolution:"Obtain coordinated wall-type plan and performance schedule."},
  {id:"masonry-height",topic:"Masonry height",basis:"11'-0\" (3.3528 m) floor-to-floor height is used for floors 1–6.",impact:"Beam/slab junctions may alter measured height.",resolution:"Confirm coordinated sections and structural framing."},
  {id:"opening-hosts",topic:"Opening hosts",basis:"External openings are provisionally allocated to 225 mm walls; internal doors to 115 mm walls.",impact:"Net wall quantities depend on this assumption.",resolution:"Confirm host-wall schedule."},
  {id:"ground-roof",topic:"Ground and roof masonry",basis:"No reliable centreline take-off was supplied.",impact:"Masonry BOQ covers floors 1–6 only.",resolution:"Complete ground and roof wall take-off."},
  {id:"structural-status",topic:"Structural status",basis:"Masonry is treated as non-load-bearing unless expressly confirmed.",impact:"No structural masonry, lintel or reinforcement quantity is included.",resolution:"Obtain IFC structural information."},
  {id:"floor-split",topic:"Floor finish split",basis:"Several source areas are composite/gross controls.",impact:"Individual finish quantities cannot yet be separated.",resolution:"Obtain room-by-room finish plan and net areas."},
  {id:"wall-finish-split",topic:"Wall finish split",basis:"Both-face control is calculated from net masonry only.",impact:"W01/W02/W03/W05 quantities remain TBC.",resolution:"Obtain room data, tile heights and external elevation take-off."},
  {id:"exclusions",topic:"General exclusions",basis:"Some accessories and specialist items remain separately measurable.",impact:"Potential additional BOQ items.",resolution:"Complete coordinated details and schedules."},
];

export const workbookStatus = (status: WorkbookSourceStatus) =>
  status === "CONFIRMED" ? "confirmed" : status === "CONTROL" ? "ready" : "needs_review";

