import type { BeamFamily, BeamRun, ColumnFamily, ColumnInstance, SlabFamily, SlabPlate } from "./structuralTypes";

export const COLUMN_FAMILIES: ColumnFamily[] = [
  { id: "C-24X12", mark: "24×12", description: "RCC column — ground to first-floor arrangement", shape: "Rectangular", widthMm: 610, depthMm: 305, source: "Structural sheet 23 · 24\" × 12\"", color: "#2563eb" },
  { id: "C-32X9", mark: "32×9", description: "RCC column — first floor to roof terrace", shape: "Rectangular", widthMm: 813, depthMm: 229, source: "Structural sheet 25 · 32\" × 9\"", color: "#7c3aed" },
  { id: "C-24X9", mark: "24×9", description: "RCC roof-level column", shape: "Rectangular", widthMm: 610, depthMm: 229, source: "Structural roof arrangement · 24\" × 9\"", color: "#0891b2" },
  { id: "C-20.5X9", mark: "20½×9", description: "RCC roof-level column", shape: "Rectangular", widthMm: 521, depthMm: 229, source: "Structural roof arrangement · 20½\" × 9\"", color: "#0d9488" },
  { id: "C-18X9", mark: "18×9", description: "RCC machine-room / upper-roof column", shape: "Rectangular", widthMm: 457, depthMm: 229, source: "Structural sheet 28 · 18\" × 9\"", color: "#14b8a6" },
];

const detectedColumns = (
  prefix:string,familyId:string,floorId:string,viewportId:string,heightM:number,
  boxes:Array<[number,number,number,number]>,
):ColumnInstance[] => boxes.map(([x,y,width,height],index)=>({
  id:`${prefix}-${String(index+1).padStart(2,"0")}`,familyId,floorId,viewportId,
  bbox:{x,y,width,height},heightM,status:"needs_review",
}));

// The source structural sheets are stored with a 270° PDF rotation. The JPEG
// renderer swaps the raw vector axes, scales them to 2573 × 1820, and trims a
// small leading strip on the new Y axis. Mapping the actual filled rectangles
// (rather than their unrotated PDF coordinates) makes the overlays coincide
// with the printed column symbols.
const STRUCTURAL_IMAGE_SCALE = 2573 / 1684;
const rotatedPdfBox = (
  x:number,y:number,width:number,height:number,yOrigin:number,
):[number,number,number,number] => [
  y * STRUCTURAL_IMAGE_SCALE,
  (x - yOrigin) * STRUCTURAL_IMAGE_SCALE,
  height * STRUCTURAL_IMAGE_SCALE,
  width * STRUCTURAL_IMAGE_SCALE,
];
const groundRow = (x:number, ys:number[]) =>
  ys.map(y=>rotatedPdfBox(x,y,9,18,116));
const groundColumnBoxes:Array<[number,number,number,number]> = [
  ...groundRow(302,[254.5,452.1,605.1,758.1,955.8]),
  ...groundRow(455,[254.5,452.1,605.1,758.1,955.8]),
  ...groundRow(608,[254.5,955.8]),
  ...groundRow(689,[254.5,955.8]),
  ...groundRow(842,[254.5,452.1,578.1,632.1,758.1,955.8]),
  ...groundRow(995,[254.5,452.1,578.1,632.1,758.1,955.8]),
];

const upperRow = (x:number, includeCentre:boolean) => [
  rotatedPdfBox(x,243.2,6.7,24,96.5),
  rotatedPdfBox(x,434.8,6.7,24,96.5),
  ...(includeCentre ? [rotatedPdfBox(x,599.5,24,6.7,96.5)] : []),
  rotatedPdfBox(x,746.8,6.8,24,96.5),
  rotatedPdfBox(x,938.5,6.8,24,96.5),
];
const upperColumnBoxes:Array<[number,number,number,number]> = [
  ...upperRow(292.1,true),
  ...upperRow(446.2,true),
  rotatedPdfBox(600.3,243.2,6.7,24,96.5),rotatedPdfBox(600.3,938.5,6.7,24,96.5),
  rotatedPdfBox(679.1,243.2,6.8,24,96.5),rotatedPdfBox(679.1,938.5,6.8,24,96.5),
  ...upperRow(833.2,true),
  ...upperRow(987.3,true),
];

export const COLUMNS: ColumnInstance[] = [
  ...detectedColumns("COL-ST01","C-24X12","GF","VP-STRUCT-COL-GF",3.96,groundColumnBoxes),
  ...detectedColumns("COL-ST03","C-32X9","FF","VP-STRUCT-COL-TYP",20.27,upperColumnBoxes),
];

export const BEAM_FAMILIES: BeamFamily[] = [
  { id:"B-18X9", mark:"18×9", description:"RCC beam", widthMm:457, depthMm:229, source:"Structural sheets 24, 26–28", color:"#e11d48" },
  { id:"B-24X9", mark:"24×9", description:"RCC typical / roof beam", widthMm:610, depthMm:229, source:"Structural sheets 26–27", color:"#ea580c" },
  { id:"B-22X9", mark:"22×9", description:"RCC typical / roof beam", widthMm:559, depthMm:229, source:"Structural sheets 26–27", color:"#ca8a04" },
  { id:"B-16-18X9", mark:"16/18×9", description:"RCC varying beam", widthMm:457, depthMm:229, source:"Structural sheets 26–27", color:"#a16207" },
  { id:"B-30X9", mark:"30×9", description:"RCC roof-terrace beam", widthMm:762, depthMm:229, source:"Structural sheet 27", color:"#f97316" },
  { id:"B-32X18", mark:"32×18", description:"RCC first-floor transfer beam", widthMm:813, depthMm:457, source:"Structural sheet 24", color:"#dc2626" },
  { id:"B-30-32X18", mark:"30/32×18", description:"RCC varying first-floor transfer beam", widthMm:813, depthMm:457, source:"Structural sheet 24", color:"#be123c" },
  { id:"B-30X32", mark:"30×32", description:"RCC deep transfer beam", widthMm:762, depthMm:813, source:"Structural sheet 24", color:"#9f1239" },
  { id:"B-32X32", mark:"32×32", description:"RCC deep transfer beam", widthMm:813, depthMm:813, source:"Structural sheet 24", color:"#881337" },
  { id:"B-36X9", mark:"36×9", description:"RCC first-floor beam", widthMm:914, depthMm:229, source:"Structural sheet 24", color:"#7f1d1d" },
];

const beam = (id:string, familyId:string, kind:BeamRun["kind"], floorId:string, viewportId:string, x1:number,y1:number,x2:number,y2:number,dropMm:number):BeamRun => ({
  id,familyId,kind,floorId,viewportId,start:{x:x1,y:y1},end:{x:x2,y:y2},dropMm,status:"ready",
});

export const BEAMS: BeamRun[] = [
  // ST/02 — first-floor transfer structure. Runs follow the visible beam
  // centrelines and stop at the open stair/lift core where applicable.
  ...[310,545,780,935,1170,1406].map((y,i)=>beam(`BM-ST02-H${i+1}`,i===0||i===5?"B-32X18":"B-30-32X18","Downstand","FF","VP-STRUCT-BEAM-FF",332,y,1427,y,457)),
  ...[332,637,1123,1427].map((x,i)=>beam(`BM-ST02-V${i+1}`,i===0||i===3?"B-32X18":"B-30X32","Downstand","FF","VP-STRUCT-BEAM-FF",x,310,x,1406,457)),
  beam("BM-ST02-CORE-N","B-36X9","Downstand","FF","VP-STRUCT-BEAM-FF",637,780,1123,780,229),
  beam("BM-ST02-CORE-S","B-36X9","Downstand","FF","VP-STRUCT-BEAM-FF",637,935,1123,935,229),
  beam("BM-ST02-CORE-W","B-32X32","Downstand","FF","VP-STRUCT-BEAM-FF",835,780,835,935,813),
  beam("BM-ST02-CORE-E","B-32X32","Downstand","FF","VP-STRUCT-BEAM-FF",990,780,990,935,813),

  // ST/04 — typical 2nd–6th floor framing.
  ...[310,545,780,935,1170,1405].map((y,i)=>beam(`BM-ST04-H${i+1}`,i===0||i===5?"B-18X9":"B-24X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",318,y,1412,y,229)),
  ...[318,620,1110,1412].map((x,i)=>beam(`BM-ST04-V${i+1}`,i===0||i===3?"B-18X9":"B-22X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",x,310,x,1405,229)),
  beam("BM-ST04-CORE-N","B-24X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",620,780,1110,780,229),
  beam("BM-ST04-CORE-S","B-24X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",620,935,1110,935,229),
  beam("BM-ST04-CORE-W","B-22X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",815,780,815,935,229),
  beam("BM-ST04-CORE-E","B-22X9","Downstand","TYP","VP-STRUCT-BEAM-TYP",980,780,980,935,229),

  // ST/05 — roof-terrace framing.
  ...[280,545,780,935,1170,1405].map((y,i)=>beam(`BM-ST05-H${i+1}`,i===0||i===5?"B-18X9":i===2||i===3?"B-30X9":"B-24X9","Downstand","RF","VP-STRUCT-SLAB-ROOF",337,y,1425,y,229)),
  ...[337,637,1125,1425].map((x,i)=>beam(`BM-ST05-V${i+1}`,i===0||i===3?"B-18X9":"B-24X9","Downstand","RF","VP-STRUCT-SLAB-ROOF",x,280,x,1405,229)),
  beam("BM-ST05-CORE-W","B-30X9","Downstand","RF","VP-STRUCT-SLAB-ROOF",815,780,815,935,229),
  beam("BM-ST05-CORE-E","B-30X9","Downstand","RF","VP-STRUCT-SLAB-ROOF",980,780,980,935,229),

  // ST/06 — upper-roof, machine-room and water-tank perimeter beams.
  beam("BM-ST06-UR-N","B-18X9","Downstand","RF","VP-STRUCT-ROOF-PLAN",1319,842,1808,842,229),
  beam("BM-ST06-UR-S","B-18X9","Downstand","RF","VP-STRUCT-ROOF-PLAN",1319,963,1808,963,229),
  beam("BM-ST06-UR-W","B-18X9","Downstand","RF","VP-STRUCT-ROOF-PLAN",1319,842,1319,963,229),
  beam("BM-ST06-UR-E","B-18X9","Downstand","RF","VP-STRUCT-ROOF-PLAN",1808,842,1808,963,229),
  beam("BM-ST06-MW-N","B-18X9","Downstand","RF","VP-STRUCT-MACHINE-WATER",1320,1278,1808,1278,229),
  beam("BM-ST06-MW-S","B-18X9","Downstand","RF","VP-STRUCT-MACHINE-WATER",1320,1399,1808,1399,229),
  beam("BM-ST06-MW-W","B-18X9","Downstand","RF","VP-STRUCT-MACHINE-WATER",1320,1278,1320,1399,229),
  beam("BM-ST06-MW-D","B-18X9","Downstand","RF","VP-STRUCT-MACHINE-WATER",1668,1278,1668,1399,229),
  beam("BM-ST06-MW-E","B-18X9","Downstand","RF","VP-STRUCT-MACHINE-WATER",1808,1278,1808,1399,229),
];

export const SLAB_FAMILIES: SlabFamily[] = [
  { id:"S-TRANSFER-152", mark:"TR-6", description:"First-floor transfer slab", thicknessMm:152, falls:"Level shown on ST/02", source:"ST/02 · 6 inch panel", color:"#60a5fa" },
  { id:"S-TRANSFER-178", mark:"TR-7", description:"First-floor transfer slab", thicknessMm:178, falls:"Level shown on ST/02", source:"ST/02 · 7 inch panel", color:"#3b82f6" },
  { id:"S-TRANSFER-203", mark:"TR-8", description:"First-floor transfer slab", thicknessMm:203, falls:"Toilets/balconies to gullies", source:"ST/02 · 8 inch panel", color:"#2563eb" },
  { id:"S-TRANSFER-254", mark:"TR-10", description:"First-floor transfer slab", thicknessMm:254, falls:"Level shown on ST/02", source:"ST/02 · 10 inch panel", color:"#1d4ed8" },
  { id:"S-TYPICAL-127", mark:"TYP-5", description:"Typical suspended slab", thicknessMm:127, falls:"Toilets/balconies to gullies", source:"ST/04 · 5 inch panel", color:"#67e8f9" },
  { id:"S-TYPICAL-152", mark:"TYP-6", description:"Typical suspended slab", thicknessMm:152, falls:"Toilets/balconies to gullies", source:"ST/04 · 6 inch panel", color:"#22d3ee" },
  { id:"S-TYPICAL-178", mark:"TYP-7", description:"Typical suspended slab", thicknessMm:178, falls:"Level shown on ST/04", source:"ST/04 · 7 inch panel", color:"#0ea5e9" },
  { id:"S-TYPICAL-203", mark:"TYP-8", description:"Typical suspended slab", thicknessMm:203, falls:"Level shown on ST/04", source:"ST/04 · 8 inch panel", color:"#0284c7" },
  { id:"S-TERRACE-152", mark:"RT-6", description:"Roof-terrace slab", thicknessMm:152, falls:"Terrace falls to outlets", source:"ST/05 · 6 inch panel", color:"#5eead4" },
  { id:"S-TERRACE-178", mark:"RT-7", description:"Roof-terrace slab", thicknessMm:178, falls:"Terrace falls to outlets", source:"ST/05 · 7 inch panel", color:"#14b8a6" },
  { id:"S-TERRACE-203", mark:"RT-8", description:"Roof-terrace slab", thicknessMm:203, falls:"Terrace falls to outlets", source:"ST/05 · 8 inch panel", color:"#0f766e" },
  { id:"S-ROOF-203", mark:"ST-RF-8", description:"Upper roof slab", thicknessMm:203, falls:"Roof falls coordinated with waterproofing", source:"ST/06 · +104'-6\" level · 8 inch slab", color:"#7c3aed" },
  { id:"S-MACHINE-178", mark:"ST-MR-7", description:"Machine-room roof slab", thicknessMm:178, falls:"Roof falls coordinated with waterproofing", source:"ST/06 · +94'-6\" level · 7 inch slab", color:"#9333ea" },
  { id:"S-WATER-152", mark:"ST-WT-6", description:"Water-tank roof slab", thicknessMm:152, falls:"Falls and waterproofing to tank detail", source:"ST/06 · +94'-6\" level · 6 inch slab", color:"#c026d3" },
];

const plate = (id:string,familyId:string,floorId:string,viewportId:string,points:SlabPlate["points"],voids:SlabPlate["voids"]=[],extra:Partial<SlabPlate>={}):SlabPlate => ({id,familyId,floorId,viewportId,points,voids,status:"needs_review",...extra});
const sectionPlate = (id:string,viewportId:string,floorId:string,linkedPlanSlabId:string,topY:number,thicknessMm:number):SlabPlate => ({
  id,
  familyId:floorId==="FF"?"S-TRANSFER-203":floorId==="RF"?"S-TERRACE-178":"S-TYPICAL-178",
  floorId,
  viewportId,
  points:[],
  voids:[],
  sectionProfile:{x0:320,x1:1460,stepX:760,topY,bottomY:topY+thicknessMm/20,stepOffset:-3},
  thicknessOverrideMm:thicknessMm,
  thicknessStatus:"needs_review",
  linkedPlanSlabId,
  quantityExcludedReason:"Section evidence only; quantity is owned by the linked structural plan slab.",
  status:"needs_review",
});
const rect=(x0:number,y0:number,x1:number,y1:number):SlabPlate["points"]=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const confirmed=(thicknessOverrideMm:number):Partial<SlabPlate>=>({thicknessOverrideMm,thicknessStatus:"confirmed",status:"ready"});

export const SLAB_PLATES: SlabPlate[] = [
  // ST/02: each polygon follows a beam-bounded panel; the stair and lift core remain visibly open.
  plate("SLP-FF-NW","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(332,310,637,545),[],confirmed(203)),
  plate("SLP-FF-NC","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(637,310,1123,545),[],confirmed(254)),
  plate("SLP-FF-NE","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(1123,310,1427,545),[],confirmed(203)),
  plate("SLP-FF-W2","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(332,545,637,780),[],confirmed(254)),
  plate("SLP-FF-C2","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(637,545,1123,780),[],confirmed(254)),
  plate("SLP-FF-E2","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(1123,545,1427,780),[],confirmed(254)),
  plate("SLP-FF-W3","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(332,780,637,935),[],confirmed(203)),
  plate("SLP-FF-CORE-BRIDGE","S-TRANSFER-152","FF","VP-STRUCT-BEAM-FF",rect(835,780,990,935),[],confirmed(152)),
  plate("SLP-FF-E3","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(1123,780,1427,935),[],confirmed(203)),
  plate("SLP-FF-W4","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(332,935,637,1170),[],confirmed(254)),
  plate("SLP-FF-C4","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(637,935,1123,1170),[],confirmed(254)),
  plate("SLP-FF-E4","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(1123,935,1427,1170),[],confirmed(254)),
  plate("SLP-FF-SW","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(332,1170,637,1406),[],confirmed(203)),
  plate("SLP-FF-SC","S-TRANSFER-254","FF","VP-STRUCT-BEAM-FF",rect(637,1170,1123,1406),[],confirmed(254)),
  plate("SLP-FF-SE","S-TRANSFER-203","FF","VP-STRUCT-BEAM-FF",rect(1123,1170,1427,1406),[],confirmed(203)),

  // ST/04: typical 2nd–6th floor. Five-inch wet/balcony panels are separated from the main plate.
  plate("SLP-TYP-NW","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(318,310,620,545),[],confirmed(178)),
  plate("SLP-TYP-NC","S-TYPICAL-152","TYP","VP-STRUCT-BEAM-TYP",rect(620,310,1110,545),[],confirmed(152)),
  plate("SLP-TYP-NE","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(1110,310,1412,545),[],confirmed(178)),
  plate("SLP-TYP-W2","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(318,545,620,780),[],confirmed(178)),
  plate("SLP-TYP-C2","S-TYPICAL-203","TYP","VP-STRUCT-BEAM-TYP",rect(620,545,1110,780),[],confirmed(203)),
  plate("SLP-TYP-E2","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(1110,545,1412,780),[],confirmed(178)),
  plate("SLP-TYP-W3","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(318,780,620,935),[],confirmed(178)),
  plate("SLP-TYP-CORE-BRIDGE","S-TYPICAL-152","TYP","VP-STRUCT-BEAM-TYP",rect(815,780,980,935),[],confirmed(152)),
  plate("SLP-TYP-E3","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(1110,780,1412,935),[],confirmed(178)),
  plate("SLP-TYP-W4","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(318,935,620,1170),[],confirmed(178)),
  plate("SLP-TYP-C4","S-TYPICAL-203","TYP","VP-STRUCT-BEAM-TYP",rect(620,935,1110,1170),[],confirmed(203)),
  plate("SLP-TYP-E4","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(1110,935,1412,1170),[],confirmed(178)),
  plate("SLP-TYP-SW","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(318,1170,620,1405),[],confirmed(178)),
  plate("SLP-TYP-SC","S-TYPICAL-152","TYP","VP-STRUCT-BEAM-TYP",rect(620,1170,1110,1405),[],confirmed(152)),
  plate("SLP-TYP-SE","S-TYPICAL-178","TYP","VP-STRUCT-BEAM-TYP",rect(1110,1170,1412,1405),[],confirmed(178)),

  // ST/05: roof terrace, including the two central 8-inch filled/terrace zones and open core.
  plate("SLP-RT-NW","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(337,280,637,545),[],confirmed(178)),
  plate("SLP-RT-NC","S-TERRACE-152","RF","VP-STRUCT-SLAB-ROOF",rect(637,280,1125,545),[],confirmed(152)),
  plate("SLP-RT-NE","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(1125,280,1425,545),[],confirmed(178)),
  plate("SLP-RT-W2","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(337,545,637,780),[],confirmed(178)),
  plate("SLP-RT-C2","S-TERRACE-203","RF","VP-STRUCT-SLAB-ROOF",rect(637,545,1125,780),[],confirmed(203)),
  plate("SLP-RT-E2","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(1125,545,1425,780),[],confirmed(178)),
  plate("SLP-RT-W3","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(337,780,637,935),[],confirmed(178)),
  plate("SLP-RT-CORE-BRIDGE","S-TERRACE-152","RF","VP-STRUCT-SLAB-ROOF",rect(815,780,980,935),[],confirmed(152)),
  plate("SLP-RT-E3","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(1125,780,1425,935),[],confirmed(178)),
  plate("SLP-RT-W4","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(337,935,637,1170),[],confirmed(178)),
  plate("SLP-RT-C4","S-TERRACE-203","RF","VP-STRUCT-SLAB-ROOF",rect(637,935,1125,1170),[],confirmed(203)),
  plate("SLP-RT-E4","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(1125,935,1425,1170),[],confirmed(178)),
  plate("SLP-RT-SW","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(337,1170,637,1405),[],confirmed(178)),
  plate("SLP-RT-SC","S-TERRACE-152","RF","VP-STRUCT-SLAB-ROOF",rect(637,1170,1125,1405),[],confirmed(152)),
  plate("SLP-RT-SE","S-TERRACE-178","RF","VP-STRUCT-SLAB-ROOF",rect(1125,1170,1425,1405),[],confirmed(178)),
  plate("SLP-UPPER-ROOF","S-ROOF-203","RF","VP-STRUCT-ROOF-PLAN",[{x:1319,y:842},{x:1808,y:842},{x:1808,y:963},{x:1319,y:963}],[],{thicknessOverrideMm:203,thicknessStatus:"confirmed"}),
  plate("SLP-MACHINE-ROOF","S-MACHINE-178","RF","VP-STRUCT-MACHINE-WATER",[{x:1320,y:1278},{x:1668,y:1278},{x:1668,y:1399},{x:1320,y:1399}],[],{thicknessOverrideMm:178,thicknessStatus:"confirmed"}),
  plate("SLP-WATER-TANK-ROOF","S-WATER-152","RF","VP-STRUCT-MACHINE-WATER",[{x:1668,y:1278},{x:1808,y:1278},{x:1808,y:1399},{x:1668,y:1399}],[],{thicknessOverrideMm:152,thicknessStatus:"confirmed"}),
  // Architectural A-A/B-B show the complete first-to-roof-terrace stack.
  sectionPlate("SLP-BB-FF","VP-SEC-BB","FF","SLP-FF-NC",1558,203),
  sectionPlate("SLP-BB-L02","VP-SEC-BB","TYP","SLP-TYP-C2",1418,178),
  sectionPlate("SLP-BB-L03","VP-SEC-BB","TYP","SLP-TYP-C2",1278,178),
  sectionPlate("SLP-BB-L04","VP-SEC-BB","TYP","SLP-TYP-C2",1138,178),
  sectionPlate("SLP-BB-L05","VP-SEC-BB","TYP","SLP-TYP-C2",998,178),
  sectionPlate("SLP-BB-L06","VP-SEC-BB","TYP","SLP-TYP-C2",858,178),
  sectionPlate("SLP-BB-RT","VP-SEC-BB","RF","SLP-RT-C2",718,178),
  sectionPlate("SLP-AA-FF","VP-SEC-AA","FF","SLP-FF-NC",1558,203),
  sectionPlate("SLP-AA-L02","VP-SEC-AA","TYP","SLP-TYP-C2",1408,178),
  sectionPlate("SLP-AA-L03","VP-SEC-AA","TYP","SLP-TYP-C2",1258,178),
  sectionPlate("SLP-AA-L04","VP-SEC-AA","TYP","SLP-TYP-C2",1108,178),
  sectionPlate("SLP-AA-L05","VP-SEC-AA","TYP","SLP-TYP-C2",958,178),
  sectionPlate("SLP-AA-L06","VP-SEC-AA","TYP","SLP-TYP-C2",808,178),
  sectionPlate("SLP-AA-RT","VP-SEC-AA","RF","SLP-RT-C2",658,178),
];
