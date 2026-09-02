import type { ChatMessage, FinishFamily, HeightRecord, Opening, OpeningFamily, Point, RoofFamily, RoofZone, ScaleCalibration, Sheet, SlabRecord, SpecificationItem, Storey, UpstandFamily, Viewport, Wall, WallFamily, WallFinishFamily, Zone } from "./types";
import { MATTEGODA_OPENING_SCHEDULE } from "./mattegodaWorkbookData";

export const SHEETS:Sheet[]=[
{id:"S01",sheetNo:"PDF/01",title:"Preliminary Specifications and Notes",revision:"-",image:"/demo/pages/maththegoda/page-01.jpg",page:1,included:true},
{id:"S02",sheetNo:"PDF/02",title:"General Specification Notes",revision:"-",image:"/demo/pages/maththegoda/page-02.jpg",page:2,included:true},
{id:"S03",sheetNo:"PDF/03",title:"Schedule of Finishes",revision:"-",image:"/demo/pages/maththegoda/page-03.jpg",page:3,included:true},
{id:"S04",sheetNo:"PDF/04",title:"Floor Finish Specifications",revision:"-",image:"/demo/pages/maththegoda/page-04.jpg",page:4,included:true},
{id:"S05",sheetNo:"PDF/05",title:"Wall and Ceiling Finish Specifications",revision:"-",image:"/demo/pages/maththegoda/page-05.jpg",page:5,included:true},
{id:"S06",sheetNo:"PDF/06",title:"Construction and Structural Notes",revision:"-",image:"/demo/pages/maththegoda/page-06.jpg",page:6,included:true},
{id:"S07",sheetNo:"PDF/07",title:"Construction and Structural Notes",revision:"-",image:"/demo/pages/maththegoda/page-07.jpg",page:7,included:true},
{id:"S08",sheetNo:"PDF/08",title:"Waterproofing and Roof Specifications",revision:"-",image:"/demo/pages/maththegoda/page-08.jpg",page:8,included:true},
{id:"S09",sheetNo:"PDF/09",title:"Waterproofing and Roof Specifications",revision:"-",image:"/demo/pages/maththegoda/page-09.jpg",page:9,included:true},
{id:"S10",sheetNo:"PDF/10",title:"Painting, Sealants and Handover",revision:"-",image:"/demo/pages/maththegoda/page-10.jpg",page:10,included:true},
{id:"S11",sheetNo:"PDF/11",title:"NRM 2 Measurement Notes",revision:"-",image:"/demo/pages/maththegoda/page-11.jpg",page:11,included:true},
{id:"S12",sheetNo:"PDF/12",title:"Reference and Coordination Notes",revision:"-",image:"/demo/pages/maththegoda/page-12.jpg",page:12,included:true},
{id:"S13",sheetNo:"AR/07",title:"Sectional Elevation B-B",revision:"-",image:"/demo/pages/maththegoda/page-13.jpg",page:13,included:true},
{id:"S14",sheetNo:"AR/08",title:"Front Elevation",revision:"-",image:"/demo/pages/maththegoda/page-14.jpg",page:14,included:true},
{id:"S15",sheetNo:"AR/09",title:"Side Elevation",revision:"-",image:"/demo/pages/maththegoda/page-15.jpg",page:15,included:true},
{id:"S16",sheetNo:"AR/10",title:"Door/window Schedule, Unit Areas, Foundation Details and Site Plan",revision:"-",image:"/demo/pages/maththegoda/page-16.jpg",page:16,included:true},
{id:"S17",sheetNo:"AR/01",title:"Ground Floor Plan",revision:"-",image:"/demo/pages/maththegoda/page-17.jpg",page:17,included:true},
{id:"S18",sheetNo:"AR/02",title:"First Floor Plan",revision:"-",image:"/demo/pages/maththegoda/page-18.jpg",page:18,included:true},
{id:"S19",sheetNo:"AR/03",title:"Typical Floor Plan (2nd-6th)",revision:"-",image:"/demo/pages/maththegoda/page-19.jpg",page:19,included:true},
{id:"S20",sheetNo:"AR/04",title:"Roof Terrace Plan",revision:"-",image:"/demo/pages/maththegoda/page-20.jpg",page:20,included:true},
{id:"S21",sheetNo:"AR/05",title:"Roof Plan",revision:"-",image:"/demo/pages/maththegoda/page-21.jpg",page:21,included:true},
{id:"S22",sheetNo:"AR/06",title:"Sectional Elevation A-A",revision:"-",image:"/demo/pages/maththegoda/page-22.jpg",page:22,included:true},
{id:"S23",sheetNo:"ST/01",title:"General Arrangement of Columns and Walls - Up to First Floor",revision:"R0",image:"/demo/pages/maththegoda/page-23.jpg",page:23,included:true},
{id:"S24",sheetNo:"ST/02",title:"General Arrangement of First Floor Transfer Floor",revision:"R0",image:"/demo/pages/maththegoda/page-24.jpg",page:24,included:true},
{id:"S25",sheetNo:"ST/03",title:"General Arrangement of Columns and Walls - First Floor to Roof Terrace",revision:"R0",image:"/demo/pages/maththegoda/page-25.jpg",page:25,included:true},
{id:"S26",sheetNo:"ST/04",title:"General Arrangement of 2nd Floor - Typical to Roof Terrace",revision:"R0",image:"/demo/pages/maththegoda/page-26.jpg",page:26,included:true},
{id:"S27",sheetNo:"ST/05",title:"General Arrangement of Roof Terrace",revision:"R0",image:"/demo/pages/maththegoda/page-27.jpg",page:27,included:true},
{id:"S28",sheetNo:"ST/06",title:"General Arrangement of Roof, Machine Room and Water Tank",revision:"R0",image:"/demo/pages/maththegoda/page-28.jpg",page:28,included:true},
];
const SCALE_PX_PER_INCH=110.06;
const metresPerPixel=(denominator:number)=>denominator/(SCALE_PX_PER_INCH*39.3700787402);
const feetAndInches=(metres:number)=>{const inches=Math.round(metres/0.0254),feet=Math.floor(inches/12),remainder=inches%12;return `${feet}'-${remainder}\"`;};
type CalibrationReferences={x:ScaleCalibration["x"];y:ScaleCalibration["y"]};
const sourceUnit=(label:string):ScaleCalibration["x"]["unit"]=>label.includes("'")||label.includes('"')?"ft-in":"m";
const REF=(x:[number,number,number,number],xLabel:string,xM:number,y:[number,number,number,number],yLabel:string,yM:number):CalibrationReferences=>({x:{line:x,label:xLabel,knownDistanceM:xM,unit:sourceUnit(xLabel),value:xLabel},y:{line:y,label:yLabel,knownDistanceM:yM,unit:sourceUnit(yLabel),value:yLabel}});
const drawingReferences:Record<string,CalibrationReferences>={
"VP-SEC-BB":REF([445,103,722,103],"22'-0\"",6.7056,[90,860,90,1000],"11'-0\"",3.3528),
"VP-FRONT":REF([445,207,775,207],"22'-0\"",6.7056,[154,860,154,1012],"11'-0\"",3.3528),
"VP-SIDE":REF([405,107,718,107],"17'-2\"",5.2324,[272,875,272,1025],"11'-0\"",3.3528),
"VP-GROUND":REF([397,236,702,236],"22'-0\"",6.7056,[164,565,164,801],"17'-2\"",5.2324),
"VP-FIRST":REF([718,1898,961,1898],"17'-8\"",5.3848,[165,620,165,856],"17'-2\"",5.2324),
"VP-TYP":REF([718,1898,961,1898],"17'-8\"",5.3848,[165,620,165,856],"17'-2\"",5.2324),
"VP-TERRACE":REF([405,231,708,231],"22'-0\"",6.7056,[165,620,165,856],"17'-2\"",5.2324),
"VP-ROOF":REF([720,1141,1068,1141],"25'-3\"",7.6962,[165,620,165,856],"17'-2\"",5.2324),
"VP-SEC-AA":REF([495,230,740,230],"17'-2\"",5.2324,[145,875,145,1025],"11'-0\"",3.3528),
"VP-STRUCT-COL-GF":REF([394,1449,696,1449],"22'-0\"",6.7056,[260,291,260,526],"17'-2\"",5.2324),
"VP-STRUCT-BEAM-FF":REF([336,1462,637,1462],"22'-0\"",6.7056,[202,310,202,545],"17'-2\"",5.2324),
"VP-STRUCT-DETAIL-Y":REF([1935,401,1960,401],"1\"",.0254,[1910,215,1910,365],"8\"",.2032),
"VP-STRUCT-TOILET":REF([1808,786,2001,786],"2'-2\"",.6604,[1574,832,1574,924],"1'-8\"",.508),
"VP-STRUCT-SECTION-BB":REF([1602,1083,1749,1083],"2'-8\"",.8128,[1574,924,1574,1062],"2'-6\"",.762),
"VP-STRUCT-SUN-SHADE":REF([2082,856,2289,856],"3'-9\"",1.143,[2331,896,2331,1044],"2'-8\"",.8128),
"VP-STRUCT-SECTION-AA":REF([1601,1330,1810,1330],"3'-9\"",1.143,[1870,1345,1870,1490],"2'-6\"",.762),
"VP-STRUCT-FLOWER-TROUGH":REF([2121,1197,2326,1197],"3'-9\"",1.143,[2385,1325,2385,1472],"2'-8\"",.8128),
"VP-STRUCT-COL-TYP":REF([376,1465,679,1465],"22'-0\"",6.7056,[243,306,243,540],"17'-2\"",5.2324),
"VP-STRUCT-BEAM-TYP":REF([323,1436,623,1436],"22'-0\"",6.7056,[188,311,188,545],"17'-2\"",5.2324),
"VP-STRUCT-TYP-TOILET":REF([1600,690,1988,690],"7'-2 1/2\"",2.1971,[1600,692,1600,879],"1'-0\"",.3048),
"VP-STRUCT-TYP-DETAIL-Y":REF([2215,1010,2315,1010],"4\"",.1016,[2300,890,2300,1045],"8\"",.2032),
"VP-STRUCT-TYP-SECTION-AA":REF([1775,1234,2016,1234],"3'-4 1/2\"",1.0287,[2016,1230,2016,1450],"2'-0\"",.6096),
"VP-STRUCT-TYP-SECTION-BB":REF([2190,1515,2410,1515],"9\"",.2286,[2320,1320,2320,1525],"1'-10\"",.5588),
"VP-STRUCT-TYP-SUN-SHADE":REF([1775,1453,2020,1453],"3'-4 1/2\"",1.0287,[1775,1377,1775,1530],"1'-6\"",.4572),
"VP-STRUCT-SLAB-ROOF":REF([336,1470,638,1470],"22'-0\"",6.7056,[202,310,202,545],"17'-2\"",5.2324),
"VP-STRUCT-ROOF-INSULATION":REF([1840,107,1925,107],"8\"",.2032,[2018,108,2018,190],"6\"",.1524),
"VP-STRUCT-ROOF-SECTION-11":REF([1662,544,1940,544],"3'-0\"",.9144,[1658,544,1658,662],"8\"",.2032),
"VP-STRUCT-ROOF-FLOWER-TROUGH":REF([1710,1192,1906,1192],"3'-0\"",.9144,[1670,1086,1670,1212],"1'-5\"",.4318),
"VP-STRUCT-ROOF-SECTION-AA":REF([1735,1513,2030,1513],"7'-7 1/2\"",2.3241,[2030,1450,2030,1585],"2'-6\"",.762),
"VP-STRUCT-ROOF-FILL-A":REF([2200,1125,2375,1125],"3'-0\"",.9144,[2160,1005,2160,1125],"6\"",.1524),
"VP-STRUCT-ROOF-WATERPROOFING":REF([1935,215,2018,215],"8\"",.2032,[2050,214,2050,287],"6\"",.1524),
"VP-STRUCT-ROOF-913":REF([303,1458,509,1458],"15'-3\"",4.6482,[230,769,230,1005],"17'-1\"",5.207),
"VP-STRUCT-ROOF-PLAN":REF([1319,1048,1528,1048],"15'-3\"",4.6482,[1248,842,1248,963],"8'-9\"",2.667),
"VP-STRUCT-MACHINE-WATER":REF([1320,1478,1529,1478],"15'-3\"",4.6482,[1248,1278,1248,1399],"8'-9\"",2.667),
};
const calibrated=(bbox:[number,number,number,number],denominator=96,label=`1/${Math.round(denominator/12)}\" = 1'-0\"`,evidence?:{box:[number,number,number,number];source:string;location:string},references?:CalibrationReferences):ScaleCalibration=>{const [x0,y0,x1,y1]=bbox,margin=Math.min(36,Math.max(12,Math.min(x1-x0,y1-y0)/9)),fallbackX:[number,number,number,number]=[x0+margin,y1-margin,x1-margin,y1-margin],fallbackY:[number,number,number,number]=[x0+margin,y1-margin,x0+margin,y0+margin],mpp=metresPerPixel(denominator),x=references?.x||{line:fallbackX,knownDistanceM:(fallbackX[2]-fallbackX[0])*mpp,label:feetAndInches((fallbackX[2]-fallbackX[0])*mpp)},y=references?.y||{line:fallbackY,knownDistanceM:(fallbackY[1]-fallbackY[3])*mpp,label:feetAndInches((fallbackY[1]-fallbackY[3])*mpp)},defaultEvidence={box:[Math.max(0,(x0+x1)/2-220),y1-75,(x0+x1)/2+220,y1+35] as [number,number,number,number],source:"Drawing label",location:"Scale printed below the selected drawing"},printedEvidence=evidence||defaultEvidence;return{printedScale:`1 : ${denominator}`,printedScaleLabel:label,printedEvidenceBox:printedEvidence.box,printedEvidenceSource:printedEvidence.source,printedEvidenceLocation:printedEvidence.location,x,y};};
const printedScaleEvidence:Record<string,{box:[number,number,number,number];source:string;location:string}>={
"VP-GROUND":{box:[745,2040,1090,2125],source:"Printed drawing caption",location:"Below Ground Floor Plan"},
"VP-FIRST":{box:[745,2040,1090,2125],source:"Printed drawing caption",location:"Below First Floor Plan"},
"VP-TYP":{box:[735,2040,1110,2125],source:"Printed drawing caption",location:"Below Typical Floor Plan"},
"VP-TERRACE":{box:[790,2025,1125,2115],source:"Printed drawing caption",location:"Below Roof Terrace Plan"},
"VP-ROOF":{box:[805,2025,1115,2115],source:"Printed drawing caption",location:"Below Roof Plan"},
"VP-SEC-AA":{box:[660,1810,1510,1935],source:"Printed drawing caption",location:"Below Sectional Elevation A-A"},
"VP-SEC-BB":{box:[660,1810,1510,1935],source:"Printed drawing caption",location:"Below Sectional Elevation B-B"},
"VP-FRONT":{box:[690,1810,1475,1935],source:"Printed drawing caption",location:"Below Front Elevation"},
"VP-SIDE":{box:[690,1810,1475,1935],source:"Printed drawing caption",location:"Below Side Elevation"},
"VP-STRUCT-COL-GF":{box:[1190,1485,1390,1560],source:"Printed view caption",location:"Below General Arrangement of Columns & Walls"},
"VP-STRUCT-BEAM-FF":{box:[1045,1510,1245,1585],source:"Printed view caption",location:"Below General Arrangement of 1st Floor Transfer Floor"},
"VP-STRUCT-COL-TYP":{box:[1165,1485,1365,1560],source:"Printed view caption",location:"Below General Arrangement of Columns & Walls"},
"VP-STRUCT-BEAM-TYP":{box:[1150,1510,1350,1585],source:"Printed view caption",location:"Below General Arrangement of 2nd Floor"},
"VP-STRUCT-SLAB-ROOF":{box:[1085,1510,1285,1585],source:"Printed view caption",location:"Below General Arrangement of Roof Terrace"},
"VP-STRUCT-ROOF-PLAN":{box:[1680,1095,1875,1175],source:"Printed view caption",location:"Below General Arrangement of Roof"},
"VP-STRUCT-MACHINE-WATER":{box:[1735,1510,1935,1590],source:"Printed view caption",location:"Below Machine Room & Water Tank Level"},
};
const rawViewports:Viewport[]=[
{id:"VP-GROUND",name:"Ground",category:"plan",sheetId:"S17",bbox:[178,315,1655,1844],order:0,status:"confirmed",scaleMPerPx:0.018},
{id:"VP-FIRST",name:"First",category:"plan",sheetId:"S18",bbox:[283,466,1571,1771],order:1,status:"confirmed",scaleMPerPx:0.018},
{id:"VP-TYP",name:"Typical 2nd–6th",category:"plan",sheetId:"S19",bbox:[283,466,1571,1771],order:2,status:"confirmed",scaleMPerPx:0.018},
{id:"VP-TERRACE",name:"Terrace",category:"plan",sheetId:"S20",bbox:[272,451,1581,1792],order:7,status:"ready",scaleMPerPx:0.018},
{id:"VP-ROOF",name:"Upper roof",category:"plan",sheetId:"S21",bbox:[272,451,1581,1792],order:8,status:"ready",scaleMPerPx:0.018},
{id:"VP-SEC-AA",name:"Section A-A",category:"section",sheetId:"S22",bbox:[189,315,1624,2221],status:"confirmed",scaleMPerPx:0.021},
{id:"VP-SEC-BB",name:"Section B-B",category:"section",sheetId:"S13",bbox:[189,315,1624,2211],status:"confirmed",scaleMPerPx:0.021},
{id:"VP-FRONT",name:"Front elevation",category:"elevation",sheetId:"S14",bbox:[272,210,1581,2054],status:"ready",scaleMPerPx:0.021},
{id:"VP-SIDE",name:"Side elevation",category:"elevation",sheetId:"S15",bbox:[272,210,1581,2054],status:"ready",scaleMPerPx:0.021},
{id:"VP-SCHED",name:"Door / window schedule",category:"schedule",sheetId:"S16",bbox:[85,101,1344,959],status:"confirmed"},
{id:"VP-AREA",name:"Unit floor areas",category:"schedule",sheetId:"S16",bbox:[1372,78,1681,1408],status:"confirmed"},
{id:"VP-FOUND",name:"Foundation details",category:"detail",sheetId:"S16",bbox:[75,980,960,2250],status:"ready"},
{id:"VP-FOUND-INTERNAL",name:"Internal wall foundation",category:"detail",sheetId:"S16",bbox:[84,990,516,1371],parentViewportId:"VP-FOUND",status:"confirmed",scaleMPerPx:metresPerPixel(24),calibration:calibrated([84,990,516,1371],24,"1\" = 2'-0\"",{box:[190,1310,410,1365],source:"Drawing label",location:"Below Internal wall foundation"},REF([302,1280,357,1280],"1'-0\"",0.3048,[390,1030,390,1305],"5'-0\"",1.524))},
{id:"VP-FOUND-BLIND",name:"Blind wall foundation",category:"detail",sheetId:"S16",bbox:[540,990,958,1371],parentViewportId:"VP-FOUND",status:"confirmed",scaleMPerPx:metresPerPixel(24),calibration:calibrated([540,990,958,1371],24,"1\" = 2'-0\"",{box:[665,1310,885,1365],source:"Drawing label",location:"Below Blind wall foundation"},REF([775,1280,830,1280],"1'-0\"",0.3048,[865,1030,865,1305],"5'-0\"",1.524))},
{id:"VP-FOUND-COLUMNS",name:"Details of columns & footings",category:"detail",sheetId:"S16",bbox:[78,1385,958,2248],parentViewportId:"VP-FOUND",status:"confirmed",calibration:{printedScale:"Not to scale",printedScaleLabel:"NOT TO SCALE",printedEvidenceBox:[300,2185,660,2245],printedEvidenceSource:"Drawing label",printedEvidenceLocation:"Below Details of columns & footings",x:{line:[0,0,0,0],knownDistanceM:0,label:"Not applicable"},y:{line:[0,0,0,0],knownDistanceM:0,label:"Not applicable"},notToScale:true}},
{id:"VP-SITE",name:"Site plan",category:"detail",sheetId:"S16",bbox:[961,1435,1765,2204],status:"confirmed",scaleMPerPx:metresPerPixel(1000),calibration:{...calibrated([961,1435,1765,2204],1000,"1 : 1000",{box:[1435,2125,1665,2195],source:"Drawing label",location:"Below Site Plan"}),printedScaleOnly:true}},
{id:"VP-SPEC-FINISH",name:"Finish schedule notes",category:"schedule",sheetId:"S03",bbox:[108,160,827,1113],status:"confirmed"},
{id:"VP-SPEC-FLOOR",name:"Floor finish specification notes",category:"schedule",sheetId:"S04",bbox:[108,238,827,1051],status:"confirmed"},
{id:"VP-SPEC-WALL",name:"Wall and ceiling finish specification notes",category:"schedule",sheetId:"S06",bbox:[108,174,827,1035],status:"confirmed"},
{id:"VP-SPEC-MASONRY",name:"Masonry specification notes",category:"schedule",sheetId:"S07",bbox:[108,621,827,1032],status:"confirmed"},
{id:"VP-SPEC-ROOF",name:"Roof specification notes",category:"schedule",sheetId:"S09",bbox:[108,494,827,1110],status:"confirmed"},
{id:"VP-SPEC-NRM",name:"NRM measurement notes",category:"schedule",sheetId:"S11",bbox:[108,332,827,1097],status:"confirmed"},
{id:"VP-SPEC-COORD",name:"Reference and coordination notes",category:"schedule",sheetId:"S12",bbox:[108,307,827,521],status:"confirmed"},
{id:"VP-STRUCT-COL-GF",name:"Columns & walls - ground to first",category:"detail",sheetId:"S23",bbox:[220,225,1580,1570],status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-COL-GF-NOTES",name:"Structural notes",category:"detail",sheetId:"S23",bbox:[2110,80,2450,520],parentViewportId:"VP-STRUCT-COL-GF",status:"confirmed"},
{id:"VP-STRUCT-BEAM-FF",name:"First-floor transfer slab",category:"plan",sheetId:"S24",bbox:[170,150,1625,1630],status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-DETAIL-X",name:"Detail X",category:"detail",sheetId:"S24",bbox:[1540,100,1800,510],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:metresPerPixel(6),calibration:{...calibrated([1540,100,1915,510],6,"2\" = 1'-0\"",{box:[1640,460,1810,520],source:"Drawing label",location:"Below Detail X"}),printedScaleOnly:true}},
{id:"VP-STRUCT-DETAIL-Y",name:"Detail Y",category:"detail",sheetId:"S24",bbox:[1750,70,2180,510],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TOILET",name:"Typical section through toilet",category:"detail",sheetId:"S24",bbox:[1590,390,2110,740],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-SECTION-BB",name:"Section B-B",category:"detail",sheetId:"S24",bbox:[1560,720,2100,1190],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-SUN-SHADE",name:"Typical section sun shade",category:"detail",sheetId:"S24",bbox:[2000,775,2480,1150],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-SECTION-AA",name:"Section A-A",category:"detail",sheetId:"S24",bbox:[1560,1210,1990,1580],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-FLOWER-TROUGH",name:"Typical section through flower trough",category:"detail",sheetId:"S24",bbox:[1990,1210,2470,1600],parentViewportId:"VP-STRUCT-BEAM-FF",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-COL-TYP",name:"Columns & walls - first to roof",category:"detail",sheetId:"S25",bbox:[190,150,2000,1600],status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-BEAM-TYP",name:"Typical suspended slab",category:"plan",sheetId:"S26",bbox:[150,150,1630,1630],status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TYP-DETAIL-X",name:"Detail X",category:"detail",sheetId:"S26",bbox:[1720,320,1980,535],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:metresPerPixel(6),calibration:{...calibrated([1760,320,1960,535],6,"2\" = 1'-0\"",{box:[1760,500,1960,555],source:"Drawing label",location:"Below Detail X"}),printedScaleOnly:true}},
{id:"VP-STRUCT-TYP-TOILET",name:"Typical section through toilet",category:"detail",sheetId:"S26",bbox:[1580,540,2090,850],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TYP-DETAIL-Y",name:"Detail Y",category:"detail",sheetId:"S26",bbox:[2080,710,2500,1100],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TYP-SECTION-AA",name:"Section A-A",category:"detail",sheetId:"S26",bbox:[1560,850,2160,1330],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TYP-FLOOR-LEVELS",name:"Floor level elevation table",category:"detail",sheetId:"S26",bbox:[1520,1360,1810,1590],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed"},
{id:"VP-STRUCT-TYP-SECTION-BB",name:"Section B-B",category:"detail",sheetId:"S26",bbox:[2140,1190,2500,1510],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-TYP-SUN-SHADE",name:"Typical section sun shade",category:"detail",sheetId:"S26",bbox:[1700,1310,2220,1610],parentViewportId:"VP-STRUCT-BEAM-TYP",status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-SLAB-ROOF",name:"Roof-terrace slab and beams",category:"plan",sheetId:"S27",bbox:[150,150,1630,1630],status:"confirmed",scaleMPerPx:0.018},
{id:"VP-STRUCT-ROOF-INSULATION",name:"Roof insulation & waterproofing detail",category:"detail",sheetId:"S27",bbox:[1560,45,2160,585],parentViewportId:"VP-STRUCT-SLAB-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-SECTION-11",name:"Section 1-1",category:"detail",sheetId:"S27",bbox:[1540,520,2160,930],parentViewportId:"VP-STRUCT-SLAB-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-FLOWER-TROUGH",name:"Typical section through flower trough",category:"detail",sheetId:"S27",bbox:[1550,800,2160,1285],parentViewportId:"VP-STRUCT-SLAB-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-SECTION-AA",name:"Section A-A",category:"detail",sheetId:"S27",bbox:[1540,1260,2280,1650],parentViewportId:"VP-STRUCT-SLAB-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-FILL-A",name:"Fill detail A",category:"detail",sheetId:"S27",bbox:[2000,780,2470,1325],parentViewportId:"VP-STRUCT-SLAB-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF",name:"Roof, machine room & water tank",category:"detail",sheetId:"S28",bbox:[140,610,1000,1660],status:"ready",scaleMPerPx:0.018},
{id:"VP-STRUCT-ROOF-WATERPROOFING",name:"Roof insulation & waterproofing detail",category:"detail",sheetId:"S28",bbox:[1540,35,2160,610],parentViewportId:"VP-STRUCT-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-913",name:"General arrangement at +91' 3\" elevation",category:"detail",sheetId:"S28",bbox:[190,720,930,1660],parentViewportId:"VP-STRUCT-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-PLAN",name:"Upper-roof slab",category:"plan",sheetId:"S28",bbox:[1190,760,1980,1250],parentViewportId:"VP-STRUCT-ROOF",status:"confirmed"},
{id:"VP-STRUCT-MACHINE-WATER",name:"Machine-room and water-tank slabs",category:"plan",sheetId:"S28",bbox:[1160,1080,2050,1570],parentViewportId:"VP-STRUCT-ROOF",status:"confirmed"},
{id:"VP-STRUCT-ROOF-NOTES",name:"Structural notes",category:"detail",sheetId:"S28",bbox:[2090,40,2500,770],parentViewportId:"VP-STRUCT-ROOF",status:"confirmed"},
];
export const VIEWPORTS:Viewport[]=rawViewports.map(viewport=>{
  if(viewport.calibration||viewport.id==="VP-FOUND"||viewport.id==="VP-STRUCT-ROOF"||viewport.id==="VP-STRUCT-TYP-FLOOR-LEVELS"||/notes/i.test(viewport.name))return viewport;
  const denominator=/detail [xy]/i.test(viewport.name)?6:/section|sun shade|flower trough|toilet|fill detail|waterproofing/i.test(viewport.name)?24:viewport.id==="VP-FOUND"?72:96;
  const label=denominator===96?"1/8\" = 1'-0\"":denominator===24?"1/2\" = 1'-0\"":denominator===6?"2\" = 1'-0\"":"1\" = 2'-0\"";
  const calibration=calibrated(viewport.bbox,denominator,label,printedScaleEvidence[viewport.id],drawingReferences[viewport.id]);
  const xPixels=Math.hypot(calibration.x.line[2]-calibration.x.line[0],calibration.x.line[3]-calibration.x.line[1]);
  const yPixels=Math.hypot(calibration.y.line[2]-calibration.y.line[0],calibration.y.line[3]-calibration.y.line[1]);
  const referenceScale=xPixels>0&&yPixels>0?(calibration.x.knownDistanceM/xPixels+calibration.y.knownDistanceM/yPixels)/2:metresPerPixel(denominator);
  return {...viewport,scaleMPerPx:referenceScale,calibration,status:"confirmed"};
});
export const STOREYS:Storey[]=[
{id:"GF",name:"Ground",levelIndex:0,factor:1,heightM:3.96,status:"confirmed"},
{id:"FF",name:"First",levelIndex:1,factor:1,heightM:3.35,status:"confirmed"},
{id:"TYP",name:"Typical 2nd–6th",levelIndex:2,factor:5,heightM:3.35,status:"confirmed"},
{id:"RF",name:"Roof Terrace",levelIndex:7,factor:1,heightM:3.50,status:"ready"},
];
const openingPalette=["#2563eb","#7c3aed","#9333ea","#db2777","#dc2626","#ea580c","#ca8a04","#65a30d","#16a34a","#059669","#0d9488","#0891b2","#0284c7","#4f46e5","#6d28d9","#a21caf","#be123c","#c2410c","#4d7c0f"];
export const OPENING_FAMILIES:OpeningFamily[]=MATTEGODA_OPENING_SCHEDULE.map((item,index)=>({
  id:item.ref,parent:item.kind,mark:item.ref,description:item.description,
  widthMm:Math.round(item.widthMm),heightMm:Math.round(item.heightMm),
  thicknessMm:item.kind==="door"?40:50,material:item.material,
  fittings:"Refer preliminary opening schedule",source:"Mattegoda Preliminary Partial BOQ · Openings",
  color:openingPalette[index%openingPalette.length],
}));
const op=(id:string,familyId:string,kind:"door"|"window",floorId:string,viewportId:string,x:number,y:number,w:number,h:number,hostWallId?:string):Opening=>({id,familyId,kind,floorId,viewportId,bbox:{x,y,width:w,height:h},hostWallId,status:"ready"});
const PDF_TO_PLAN_PX=1820/1191;
type DetectedTag=[familyId:string,pdfX:number,pdfY:number,orientation?:"horizontal"|"vertical"];
const detectedOpening=(id:string,[familyId,pdfX,pdfY,orientation]:DetectedTag,floorId:string,viewportId:string):Opening=>{
  const family=MATTEGODA_OPENING_SCHEDULE.find((item)=>item.ref===familyId)!;
  const centerX=pdfX*PDF_TO_PLAN_PX,centerY=pdfY*PDF_TO_PLAN_PX;
  const openingPx=Math.max(18,(family.widthMm/1000)/metresPerPixel(96));
  const vertical=family.kind==="window"&&(
    orientation==="vertical"||
    (orientation!=="horizontal"&&(pdfX<350||pdfX>850))
  );
  const width=family.kind==="door"?openingPx:vertical?14:openingPx;
  const height=family.kind==="door"?openingPx:vertical?openingPx:14;
  return op(id,familyId,family.kind,floorId,viewportId,centerX-width/2,centerY-height/2,width,height);
};
// Exact tag centres extracted from the vector text on AR/02 and AR/03. These
// coordinates replace the earlier schedule-count templates and sit on the
// actual printed opening symbols.
const RESIDENTIAL_OPENING_TAGS:DetectedTag[]=[
  ["D2",369.2,467.8],["D3",304.4,410.9],["D3",304.8,638.6],["D6",231.5,566.4],["D6",231.5,483.7],["FW1",236.9,521.9],["D2",410.6,591.4],["LW",251.0,605.2],["LW",251.0,446.2],
  ["D2",870.1,467.8],["D3",934.9,410.9],["D3",934.6,638.6],["D6",1007.9,566.4],["D6",1007.9,483.7],["FW1",1003.2,522.7],["D2",828.7,591.4],["LW",988.3,605.2],["LW",988.3,446.2],
  ["D2",369.2,973.6],["D3",313.5,1030.3],["D3",304.8,802.6],["D6",231.5,874.8],["D6",231.5,957.5],["FW1",239.2,917.2],["D2",410.6,850.0],["LW",251.0,836.0],["LW",251.0,995.1],
  ["D2",870.1,973.8],["D3",925.9,1030.6],["D3",934.6,802.6],["D6",1007.9,874.8],["D6",1007.9,957.7],["FW1",1003.2,918.6],["D2",828.7,850.0],["LW",988.3,836.0],["LW",988.3,995.4],
  ["SL1",621.7,417.6],["D6",568.7,400.4],["LW",537.1,417.2],["D6",670.8,400.4],["D3",499.1,472.3],["D3",740.3,472.3],["D2",558.8,538.7],["D2",680.9,538.7],["LW",705.5,417.2],["D1",654.1,616.9],
  ["SL1",621.7,1023.7],["D6",568.7,1040.8],["LW",537.1,1024.1],["D6",670.8,1040.8],["D3",499.1,968.9],["D3",740.3,968.9],["D2",558.8,902.5],["D2",680.9,902.5],["LW",705.5,1024.1],["D1",654.1,824.4],
  ["D6",791.5,673.2],["D6",791.5,768.0],["D1",800.6,623.2],["D1",802.7,818.2],["D1",439.5,623.2],["D1",437.4,818.2],["FG1",438.3,750.4],["FG1",438.3,692.0],["FG",447.4,721.7],
  ["FW2",297.7,658.0],["FW2",297.7,783.0],["FW2",297.7,1049.0],["FW2",482.7,983.2],["FW2",757.9,983.2],["FW2",943.9,1049.4],["FW2",943.9,783.2],["FW2",943.9,658.2],["FW2",943.9,392.2],["FW2",482.7,458.2],["FW2",757.9,458.2],["FW2",297.7,392.6],["D7",674.6,664.1],["D7",674.6,777.2],
];
const residentialOpenings=(floorId:"FF"|"TYP",viewportId:string,prefix:string)=>RESIDENTIAL_OPENING_TAGS.map((tag,index)=>detectedOpening(`${prefix}-${index+1}`,tag,floorId,viewportId));
const TERRACE_OPENING_TAGS:DetectedTag[]=[["FG",447.4,721.7],["SL",627.4,771.6],["D6",791.5,673.2],["D6",791.5,768.0],["D7",674.6,664.1],["D7",674.6,777.2],["SL2",537.4,930.0],["SL2",702.1,930.0],["SL2",445.3,837.0,"vertical"],["SL2",794.3,837.0,"vertical"],["SL2",537.4,511.3],["SL2",702.1,511.3],["SL2",445.3,604.3,"vertical"],["SL2",794.3,604.3,"vertical"]];
export const OPENINGS:Opening[]=[
  ...residentialOpenings("FF","VP-FIRST","OPEN-FF"),
  ...residentialOpenings("TYP","VP-TYP","OPEN-TYP"),
  detectedOpening("OPEN-G-D7-1",["D7",674.6,664.1],"GF","VP-GROUND"),detectedOpening("OPEN-G-D7-2",["D7",674.6,777.2],"GF","VP-GROUND"),detectedOpening("OPEN-G-GD",["GD",1037.2,663.7],"GF","VP-GROUND"),
  ...TERRACE_OPENING_TAGS.map((tag,index)=>detectedOpening(`OPEN-RT-${index+1}`,tag,"RF","VP-TERRACE")),
  detectedOpening("OPEN-ROOF-LW1",["LW1",638.6,669.7],"RF","VP-ROOF"),
];
export const FLOOR_FAMILIES:FinishFamily[]=[
{id:"F01",kind:"floor",mark:"F01",description:"Internal porcelain tile floor with 100 mm matching skirting",material:"600 × 600 mm porcelain tile",thicknessMm:9,screed:"Cured levelled screed; polymer-modified adhesive",falls:"Level",source:"Final PDF pp. 3–4",color:"#f59e0b"},
{id:"F02",kind:"floor",mark:"F02",description:"Toilet and bathroom slip-resistant tiled floor",material:"R10 porcelain / ceramic tile",screed:"Waterproofed screed to falls",falls:"To floor waste",source:"Final PDF pp. 3–4",color:"#06b6d4"},
{id:"F03",kind:"floor",mark:"F03",description:"Apartment balcony exterior anti-slip tiled floor",material:"Exterior porcelain tile",screed:"Waterproofed screed",falls:"To outlet",source:"Final PDF pp. 3–4",color:"#8b5cf6"},
{id:"F04",kind:"floor",mark:"F04",description:"Common-corridor heavy-duty tile and skirting",material:"Homogeneous / porcelain tile",falls:"Level with accessible transitions",source:"Final PDF pp. 3–4",color:"#6366f1"},
{id:"F05",kind:"floor",mark:"F05",description:"Entrance and lift-lobby premium heavy-duty tile",material:"Homogeneous / porcelain tile",falls:"Level with accessible transitions",source:"Final PDF pp. 3–4",color:"#22c55e"},
{id:"F06",kind:"floor",mark:"F06",description:"Stair and landing finish with contrasting nosing",material:"Granite / terrazzo / heavy-duty porcelain",falls:"Level",source:"Final PDF p. 5",color:"#a855f7"},
{id:"F07",kind:"floor",mark:"F07",description:"Gymnasium resilient sports flooring",material:"Commercial rubber / sports flooring",source:"Final PDF p. 5",color:"#14b8a6"},
{id:"F08",kind:"floor",mark:"F08",description:"Ground-floor parking and driveway finish",material:"Power-floated concrete with non-slip sealer",falls:"To drains",source:"Final PDF p. 5",color:"#f97316"},
{id:"F09",kind:"floor",mark:"F09",description:"Plant and service-room dustproof floor",material:"Primer plus two-coat epoxy system",falls:"As required",source:"Final PDF p. 5",color:"#ec4899"},
{id:"F10",kind:"floor",mark:"F10",description:"Roof-terrace anti-slip finish over protected insulated waterproofing",material:"Exterior paver / tile system",falls:"To roof outlets",source:"Final PDF p. 3",color:"#84cc16"},
{id:"F11",kind:"floor",mark:"F11",description:"Water-tank-room non-slip finish over waterproofed base",material:"Cementitious / tiled finish",falls:"To drain",source:"Final PDF p. 3",color:"#0f766e"},
{id:"F12",kind:"floor",mark:"F12",description:"Flower-trough drainage and protection layer",material:"Drainage/protection layer over root-resistant waterproofing",falls:"To outlets",source:"Final PDF p. 4",color:"#10b981"},
];
export const CEILING_FAMILIES:FinishFamily[]=[
{id:"C01",kind:"ceiling",mark:"C01",description:"Painted RCC soffit",material:"Prepared RCC, primer, skim and acrylic emulsion",source:"Final PDF p. 6",color:"#60a5fa"},
{id:"C02",kind:"ceiling",mark:"C02",description:"Moisture-resistant wet-area ceiling",material:"MR gypsum / cementitious board or moisture-resistant painted soffit",source:"Final PDF p. 7",color:"#a78bfa"},
{id:"C03",kind:"ceiling",mark:"C03",description:"External soffit coating",material:"Exterior anti-carbonation / elastomeric coating",source:"Final PDF p. 7",color:"#34d399"},
{id:"C04",kind:"ceiling",mark:"C04",description:"Moisture-resistant suspended gypsum-board ceiling",material:"Proprietary galvanized framing and board",source:"Final PDF p. 7",color:"#818cf8"},
{id:"C05",kind:"ceiling",mark:"C05",description:"Acoustic suspended ceiling",material:"Proprietary acoustic tile / board system",source:"Final PDF p. 7",color:"#c084fc"},
{id:"C06",kind:"ceiling",mark:"C06",description:"Painted exposed service-room soffit",material:"Washable acrylic coating",source:"Final PDF p. 7",color:"#2dd4bf"},
{id:"C07",kind:"ceiling",mark:"C07",description:"Water-tank-room mould-resistant soffit coating",material:"Mould-resistant coating",source:"Final PDF p. 7",color:"#0d9488"},
];
const z=(id:string,kind:"floor"|"ceiling",familyId:string,floorId:string,viewportId:string,points:any[],room:string,deducts:any[]=[]):Zone=>({id,kind,familyId,floorId,viewportId,points,deducts,room,status:"ready"});
const box=(x0:number,y0:number,x1:number,y1:number)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
export const FLOOR_ZONES:Zone[]=[
// AR/01 ground: parking/driveway fields, entrance core and service rooms.
z("FLR-G-PARK-NW","floor","F08","GF","VP-GROUND",box(330,520,670,965),"Parking and driveway — north-west"),
z("FLR-G-PARK-NC","floor","F08","GF","VP-GROUND",box(700,545,1145,965),"Parking and driveway — north-centre"),
z("FLR-G-PARK-NE","floor","F08","GF","VP-GROUND",box(1155,520,1470,965),"Parking and driveway — north-east"),
z("FLR-G-LOBBY","floor","F05","GF","VP-GROUND",box(650,965,1160,1115),"Entrance and lift lobby",[box(990,985,1080,1095)]),
z("FLR-G-PARK-SW","floor","F08","GF","VP-GROUND",box(330,1115,670,1570),"Parking and driveway — south-west"),
z("FLR-G-PARK-SC","floor","F08","GF","VP-GROUND",box(700,1115,1145,1545),"Parking and driveway — south-centre"),
z("FLR-G-PARK-SE","floor","F08","GF","VP-GROUND",box(1155,1115,1470,1570),"Parking and driveway — south-east"),
z("FLR-G-PLANT","floor","F09","GF","VP-GROUND",box(990,1115,1145,1245),"Ground-floor plant/service room"),

// AR/02 first floor: six apartment finish hosts. Wet rooms and balconies are
// deducted from F01 and reintroduced below as their own F02/F03 finish zones.
z("FLR-FF-A","floor","F01","FF","VP-FIRST",box(330,520,670,965),"Apartment A — dry rooms",[box(330,520,430,650),box(330,650,375,790)]),
z("FLR-FF-B","floor","F01","FF","VP-FIRST",box(700,545,1145,965),"Apartment B — dry rooms",[box(700,545,805,675),box(700,675,745,815)]),
z("FLR-FF-C","floor","F01","FF","VP-FIRST",box(1155,520,1470,965),"Apartment C — dry rooms",[box(1370,520,1470,650),box(1425,650,1470,790)]),
z("FLR-FF-D","floor","F01","FF","VP-FIRST",box(330,1115,670,1570),"Apartment D — dry rooms",[box(330,1440,430,1570),box(330,1300,375,1440)]),
z("FLR-FF-E","floor","F01","FF","VP-FIRST",box(700,1115,1145,1545),"Apartment E — dry rooms",[box(700,1415,805,1545),box(700,1275,745,1415)]),
z("FLR-FF-F","floor","F01","FF","VP-FIRST",box(1155,1115,1470,1570),"Apartment F — dry rooms",[box(1370,1440,1470,1570),box(1425,1300,1470,1440)]),
z("FLR-FF-A-WET","floor","F02","FF","VP-FIRST",box(330,520,430,650),"Apartment A toilet/bathroom"),
z("FLR-FF-B-WET","floor","F02","FF","VP-FIRST",box(700,545,805,675),"Apartment B toilet/bathroom"),
z("FLR-FF-C-WET","floor","F02","FF","VP-FIRST",box(1370,520,1470,650),"Apartment C toilet/bathroom"),
z("FLR-FF-D-WET","floor","F02","FF","VP-FIRST",box(330,1440,430,1570),"Apartment D toilet/bathroom"),
z("FLR-FF-E-WET","floor","F02","FF","VP-FIRST",box(700,1415,805,1545),"Apartment E toilet/bathroom"),
z("FLR-FF-F-WET","floor","F02","FF","VP-FIRST",box(1370,1440,1470,1570),"Apartment F toilet/bathroom"),
z("FLR-FF-A-BAL","floor","F03","FF","VP-FIRST",box(330,650,375,790),"Apartment A balcony"),
z("FLR-FF-B-BAL","floor","F03","FF","VP-FIRST",box(700,675,745,815),"Apartment B balcony"),
z("FLR-FF-C-BAL","floor","F03","FF","VP-FIRST",box(1425,650,1470,790),"Apartment C balcony"),
z("FLR-FF-D-BAL","floor","F03","FF","VP-FIRST",box(330,1300,375,1440),"Apartment D balcony"),
z("FLR-FF-E-BAL","floor","F03","FF","VP-FIRST",box(700,1275,745,1415),"Apartment E balcony"),
z("FLR-FF-F-BAL","floor","F03","FF","VP-FIRST",box(1425,1300,1470,1440),"Apartment F balcony"),
z("FLR-FF-COR","floor","F04","FF","VP-FIRST",box(650,965,1160,1115),"First-floor common corridor",[box(990,985,1080,1095)]),
z("FLR-FF-LOB","floor","F05","FF","VP-FIRST",box(835,985,990,1095),"First-floor lift lobby"),
z("FLR-FF-STAIR","floor","F06","FF","VP-FIRST",box(650,985,835,1095),"First-floor stair landing"),

// AR/03 represents floors 2–6 once; Workbook applies repetition ×5.
...[
  ["A",330,520,670,965,330,520,430,650,330,650,375,790],
  ["B",700,545,1145,965,700,545,805,675,700,675,745,815],
  ["C",1155,520,1470,965,1370,520,1470,650,1425,650,1470,790],
  ["D",330,1115,670,1570,330,1440,430,1570,330,1300,375,1440],
  ["E",700,1115,1145,1545,700,1415,805,1545,700,1275,745,1415],
  ["F",1155,1115,1470,1570,1370,1440,1470,1570,1425,1300,1470,1440],
].flatMap((v:any[])=>{
  const [name,x0,y0,x1,y1,wx0,wy0,wx1,wy1,bx0,by0,bx1,by1]=v;
  return [
    z(`FLR-TYP-${name}`,"floor","F01","TYP","VP-TYP",box(x0,y0,x1,y1),`Typical apartment ${name} — dry rooms`,[box(wx0,wy0,wx1,wy1),box(bx0,by0,bx1,by1)]),
    z(`FLR-TYP-${name}-WET`,"floor","F02","TYP","VP-TYP",box(wx0,wy0,wx1,wy1),`Typical apartment ${name} toilet/bathroom`),
    z(`FLR-TYP-${name}-BAL`,"floor","F03","TYP","VP-TYP",box(bx0,by0,bx1,by1),`Typical apartment ${name} balcony`),
  ];
}),
z("FLR-TYP-COR","floor","F04","TYP","VP-TYP",box(650,965,1160,1115),"Typical common corridor",[box(990,985,1080,1095)]),
z("FLR-TYP-LOB","floor","F05","TYP","VP-TYP",box(835,985,990,1095),"Typical lift lobby"),
z("FLR-TYP-STAIR","floor","F06","TYP","VP-TYP",box(650,985,835,1095),"Typical stair landing"),

// AR/04 roof terrace: open terrace fields, enclosed amenity/core spaces and troughs.
z("FLR-RT-N","floor","F10","RF","VP-TERRACE",box(330,500,1470,790),"Open roof terrace — north",[box(650,650,1160,790)]),
z("FLR-RT-S","floor","F10","RF","VP-TERRACE",box(330,1115,1470,1570),"Open roof terrace — south",[box(650,1115,1160,1280)]),
z("FLR-RT-GYM","floor","F07","RF","VP-TERRACE",box(650,650,900,790),"Gymnasium"),
z("FLR-RT-MGMT","floor","F01","RF","VP-TERRACE",box(900,650,1160,790),"Management/condominium room"),
z("FLR-RT-COR","floor","F05","RF","VP-TERRACE",box(650,965,1160,1115),"Roof-terrace lobby and circulation",[box(990,985,1080,1095)]),
z("FLR-RT-STAIR","floor","F06","RF","VP-TERRACE",box(650,985,835,1095),"Roof-terrace stair landing"),
z("FLR-RT-WET","floor","F02","RF","VP-TERRACE",box(1080,985,1160,1095),"Roof-terrace toilet"),
z("FLR-RT-TROUGH-W","floor","F12","RF","VP-TERRACE",box(290,500,330,1570),"West flower trough"),
z("FLR-RT-TROUGH-E","floor","F12","RF","VP-TERRACE",box(1470,500,1510,1570),"East flower trough"),
z("FLR-ROOF-WATER","floor","F11","RF","VP-ROOF",box(700,1065,1060,1165),"Water-tank room floor"),
z("FLR-ROOF-MACHINE","floor","F09","RF","VP-ROOF",box(1060,1065,1190,1165),"Lift machine-room floor"),
];
const ceilingFamilyForFloorFinish:Record<string,string|undefined>={F01:"C01",F02:"C02",F03:"C03",F04:"C01",F05:"C01",F06:"C01",F07:"C05",F08:"C03",F09:"C06",F11:"C07"};
// Ceiling keeps an independent copy of the room geometry. Open terrace and
// flower-trough surfaces have no overhead ceiling and are omitted.
export const CEILING_ZONES:Zone[]=FLOOR_ZONES.flatMap((floorZone)=>{
  const familyId=ceilingFamilyForFloorFinish[floorZone.familyId];
  if(!familyId)return [];
  return [{...floorZone,id:`CEIL-${floorZone.id}`,kind:"ceiling" as const,familyId,points:floorZone.points.map((point)=>({...point})),deducts:floorZone.deducts.map((deduct)=>deduct.map((point)=>({...point}))),room:`${floorZone.room} — ceiling`}];
});
export const WALL_FAMILIES:WallFamily[]=[
{id:"M01",mark:"M01",description:"External masonry; fire/acoustic/thermal performance to be confirmed",thicknessMm:225,classification:"External",material:"Clay brick / approved block",color:"#ef4444"},
{id:"M02",mark:"M02",description:"Apartment-separating / corridor masonry",thicknessMm:225,classification:"Internal",material:"Masonry / approved tested system",color:"#f97316"},
{id:"M03",mark:"M03",description:"Internal apartment non-load-bearing partition",thicknessMm:115,classification:"Internal",material:"Brick / block masonry",color:"#eab308"},
{id:"M04",mark:"M04",description:"Wet-area partition supporting sanitaryware and waterproofing",thicknessMm:115,classification:"Internal",material:"Masonry / moisture-resistant system",color:"#84cc16"},
{id:"M05",mark:"M05",description:"Lift, stair and service-shaft wall; consultant confirmation required",thicknessMm:225,classification:"Internal",material:"RCC core / tested fire-rated assembly",color:"#8b5cf6"},
{id:"M06",mark:"M06",description:"Parapet / guard wall with waterproofed base and coping",thicknessMm:150,classification:"External",material:"Structurally detailed masonry / RCC",color:"#0ea5e9"},
];
export const WALL_FINISH_FAMILIES:WallFinishFamily[]=[
{id:"W01",mark:"W01",description:"Internal plaster, skim and acrylic emulsion",material:"12–15 mm plaster + paint",thicknessMm:15,source:"Final PDF p. 5",color:"#0ea5e9"},
{id:"W02",mark:"W02",description:"Durable washable internal plaster and paint",material:"12–15 mm plaster + washable paint",thicknessMm:15,source:"Final PDF p. 5",color:"#6366f1"},
{id:"W03",mark:"W03",description:"Full-height toilet / wet-area wall tiling",material:"Ceramic / porcelain tile",thicknessMm:10,source:"Final PDF pp. 5–6",color:"#8b5cf6"},
{id:"W04",mark:"W04",description:"Pantry splashback, minimum 600 mm high",material:"Glazed tile / impervious panel",thicknessMm:10,source:"Final PDF p. 6",color:"#d946ef"},
{id:"W05",mark:"W05",description:"External render and weatherproof coating",material:"15–20 mm render + exterior coating",thicknessMm:18,source:"Final PDF p. 6",color:"#10b981"},
{id:"W06",mark:"W06",description:"Gymnasium impact-resistant wall coating",material:"Prepared plaster + washable impact-resistant acrylic",thicknessMm:15,source:"Final PDF p. 6",color:"#f59e0b"},
{id:"W07",mark:"W07",description:"Plant and service-room washable wall coating",material:"Render / plaster + mould-resistant coating",thicknessMm:15,source:"Final PDF p. 6",color:"#64748b"},
{id:"W08",mark:"W08",description:"Water-tank and wet-risk wall tanking",material:"Cementitious waterproof coating",thicknessMm:3,source:"Final PDF p. 6",color:"#06b6d4"},
{id:"W09",mark:"W09",description:"Flower-trough root-resistant lining",material:"Root-resistant waterproofing + protection board",thicknessMm:4,source:"Final PDF p. 6",color:"#16a34a"},
];
const w=(id:string,familyId:string,floorId:string,viewportId:string,x1:number,y1:number,x2:number,y2:number,side1Finish?:string,side2Finish?:string):Wall=>({id,familyId,floorId,viewportId,start:{x:x1,y:y1},end:{x:x2,y:y2},heightM:floorId==="GF"?3.96:floorId==="RF"?3.50:3.35,side1Finish:side1Finish||(familyId==="M01"||familyId==="M06"?"W05":"W01"),side2Finish:side2Finish||"W01",status:"confirmed"});
type WallRun=[familyId:string,x1:number,y1:number,x2:number,y2:number,side1Finish?:string,side2Finish?:string];
const wallSet=(prefix:string,floorId:string,viewportId:string,runs:WallRun[])=>runs.map((run,index)=>w(`WALL-${prefix}-${String(index+1).padStart(3,"0")}`,run[0],floorId,viewportId,run[1],run[2],run[3],run[4],run[5],run[6]));
const residentialWallRuns:WallRun[]=[
  // Upper apartment block outlines, traced to the actual stepped plan edges.
  ["M01",397,559,697,559],["M01",397,559,397,1040],["M02",397,1040,640,1040],["M02",640,965,697,965],["M02",640,965,640,1040],["M02",697,559,697,965],
  ["M01",705,646,1192,646],["M02",705,646,705,965],["M02",1192,646,1192,965],["M02",705,965,1192,965],
  ["M01",1192,559,1497,559],["M02",1192,559,1192,965],["M01",1497,559,1497,1040],["M02",1192,965,1253,965],["M02",1253,965,1253,1040],["M02",1253,1040,1497,1040],
  // Upper-left apartment partitions and wet rooms.
  ["M04",430,559,430,683,"W03","W01"],["M04",397,683,548,683,"W03","W01"],["M03",548,559,548,683],["M03",548,683,697,683],
  ["M04",397,722,485,722,"W03","W01"],["M04",485,683,485,802,"W03","W01"],["M03",485,802,548,802],["M03",548,683,548,802],
  ["M04",397,871,430,871,"W03","W01"],["M04",430,802,430,954,"W03","W01"],["M03",430,954,548,954],["M03",548,802,548,1040],["M03",548,871,640,871],["M03",640,683,640,802],
  // Upper-centre apartment partitions and wet rooms.
  ["M04",705,683,860,683,"W03","W01"],["M04",860,646,860,722,"W03","W01"],["M04",1033,646,1033,722,"W03","W01"],["M04",1033,683,1192,683,"W03","W01"],
  ["M03",860,722,947,722],["M03",1033,722,1110,722],["M03",860,722,860,802],["M03",1033,722,1033,802],["M03",705,802,860,802],["M03",1033,802,1192,802],
  ["M03",860,802,860,954],["M03",1033,802,1033,954],["M03",860,954,947,954],["M03",1033,954,1192,954],["M03",947,722,947,802],
  // Upper-right apartment partitions and wet rooms.
  ["M04",1464,559,1464,683,"W03","W01"],["M04",1346,683,1497,683,"W03","W01"],["M03",1346,559,1346,683],["M03",1192,683,1346,683],
  ["M04",1408,683,1408,802,"W03","W01"],["M04",1408,722,1497,722,"W03","W01"],["M03",1346,683,1346,802],["M03",1346,802,1408,802],
  ["M04",1464,802,1464,954,"W03","W01"],["M04",1464,871,1497,871,"W03","W01"],["M03",1346,954,1464,954],["M03",1346,802,1346,1040],["M03",1253,871,1346,871],["M03",1253,683,1253,802],
  // Lower apartment block outlines.
  ["M02",397,1166,640,1166],["M02",640,1166,640,1241],["M02",640,1241,697,1241],["M02",697,1241,697,1642],["M01",397,1642,697,1642],["M01",397,1166,397,1642],
  ["M02",705,1241,1192,1241],["M02",705,1241,705,1552],["M02",1192,1241,1192,1552],["M01",705,1552,1192,1552],
  ["M02",1253,1166,1497,1166],["M02",1253,1166,1253,1241],["M02",1192,1241,1253,1241],["M02",1192,1241,1192,1642],["M01",1192,1642,1497,1642],["M01",1497,1166,1497,1642],
  // Lower-left partitions (vertical mirror of the upper-left apartment).
  ["M04",430,1521,430,1642,"W03","W01"],["M04",397,1521,548,1521,"W03","W01"],["M03",548,1521,548,1642],["M03",548,1521,697,1521],
  ["M04",397,1482,485,1482,"W03","W01"],["M04",485,1402,485,1521,"W03","W01"],["M03",485,1402,548,1402],["M03",548,1402,548,1521],
  ["M04",397,1333,430,1333,"W03","W01"],["M04",430,1250,430,1402,"W03","W01"],["M03",430,1250,548,1250],["M03",548,1166,548,1402],["M03",548,1333,640,1333],["M03",640,1402,640,1521],
  // Lower-centre partitions.
  ["M04",705,1521,860,1521,"W03","W01"],["M04",860,1482,860,1552,"W03","W01"],["M04",1033,1482,1033,1552,"W03","W01"],["M04",1033,1521,1192,1521,"W03","W01"],
  ["M03",860,1482,947,1482],["M03",1033,1482,1110,1482],["M03",860,1402,860,1482],["M03",1033,1402,1033,1482],["M03",705,1402,860,1402],["M03",1033,1402,1192,1402],
  ["M03",860,1250,860,1402],["M03",1033,1250,1033,1402],["M03",860,1250,947,1250],["M03",1033,1250,1192,1250],["M03",947,1402,947,1482],
  // Lower-right partitions.
  ["M04",1464,1521,1464,1642,"W03","W01"],["M04",1346,1521,1497,1521,"W03","W01"],["M03",1346,1521,1346,1642],["M03",1192,1521,1346,1521],
  ["M04",1408,1402,1408,1521,"W03","W01"],["M04",1408,1482,1497,1482,"W03","W01"],["M03",1346,1402,1346,1521],["M03",1346,1402,1408,1402],
  ["M04",1464,1250,1464,1402,"W03","W01"],["M04",1464,1333,1497,1333,"W03","W01"],["M03",1346,1250,1464,1250],["M03",1346,1166,1346,1402],["M03",1253,1333,1346,1333],["M03",1253,1402,1253,1521],
  // Corridors, stair, lift and service core.
  ["M02",640,1040,697,1040],["M02",697,1040,915,1040],["M02",1192,1040,1253,1040],["M02",640,1166,697,1166],["M02",697,1166,915,1166],["M02",1192,1166,1253,1166],
  ["M05",697,1040,697,1166],["M05",915,1040,915,1166],["M05",697,1166,915,1166],
  ["M05",1053,1034,1192,1034],["M05",1053,1034,1053,1166],["M05",1192,1034,1192,1166],["M05",1053,1166,1192,1166],
  ["M04",1197,1040,1253,1040,"W03","W02"],["M04",1253,1040,1253,1156,"W03","W02"],["M04",1197,1156,1253,1156,"W03","W02"],
];
const groundWallRuns:WallRun[]=[
  // Garbage room, stair/lobby, lift, electrical duct and panel room.
  ["M03",700,1080,875,1080],["M03",700,1080,700,1225],["M03",700,1225,875,1225],["M03",875,1080,875,1225],
  ["M05",875,1040,1045,1040],["M05",875,1040,875,1245],["M05",875,1245,1045,1245],["M05",1045,1040,1045,1245],
  ["M05",1045,1040,1160,1040],["M05",1160,1040,1160,1195],["M05",1045,1195,1160,1195],
  ["M04",1160,1040,1245,1040,"W03","W02"],["M04",1245,1040,1245,1195,"W03","W02"],["M04",1160,1195,1245,1195,"W03","W02"],
  ["M03",1300,1080,1470,1080],["M03",1300,1080,1300,1225],["M03",1300,1225,1470,1225],["M03",1470,1080,1470,1225],
  // Entrance enclosure and parking-edge guard/parapet returns.
  ["M02",875,1245,875,1420],["M02",875,1420,1045,1420],["M02",1045,1245,1045,1420],
  ["M06",350,595,350,940],["M06",1540,595,1540,940],["M06",350,1260,350,1610],["M06",1540,1260,1540,1610],
];
const terraceWallRuns:WallRun[]=[
  // Terrace parapets and flower-trough guard walls.
  ["M06",315,470,695,470],["M06",315,470,315,970],["M06",315,970,695,970],["M06",695,470,695,650],
  ["M06",1050,470,1435,470],["M06",1435,470,1435,970],["M06",1050,970,1435,970],["M06",1050,470,1050,650],
  ["M06",315,1110,695,1110],["M06",315,1110,315,1625],["M06",315,1625,695,1625],["M06",695,1450,695,1625],
  ["M06",1050,1110,1435,1110],["M06",1435,1110,1435,1625],["M06",1050,1625,1435,1625],["M06",1050,1450,1050,1625],
  // Management room and gymnasium enclosures.
  ["M01",650,650,1160,650],["M01",650,650,650,790],["M01",1160,650,1160,790],["M02",650,790,1160,790],
  ["M02",650,1280,1160,1280],["M01",650,1280,650,1450],["M01",1160,1280,1160,1450],["M01",650,1450,1160,1450],
  // Central stair/lift/service core.
  ["M05",650,965,835,965],["M05",650,965,650,1115],["M05",650,1115,835,1115],["M05",835,965,835,1115],
  ["M05",990,965,1080,965],["M05",990,965,990,1115],["M05",1080,965,1080,1115],["M05",990,1115,1080,1115],
  ["M04",1080,965,1160,965,"W03","W02"],["M04",1160,965,1160,1115,"W03","W02"],["M04",1080,1115,1160,1115,"W03","W02"],
  ["M02",835,965,990,965],["M02",835,1115,990,1115],
];
const roofWallRuns:WallRun[]=[
  ["M06",650,520,1080,520],["M06",650,520,650,810],["M06",1080,520,1080,810],["M06",650,810,1080,810],
  ["M01",720,575,1010,575],["M01",720,575,720,755],["M01",1010,575,1010,755],["M01",720,755,1010,755],
  ["M05",850,575,850,755],["M04",930,575,930,755,"W08","W07"],
];
export const WALLS:Wall[]=[
  ...wallSet("GF","GF","VP-GROUND",groundWallRuns),
  ...wallSet("FF","FF","VP-FIRST",residentialWallRuns),
  ...wallSet("TYP","TYP","VP-TYP",residentialWallRuns),
  ...wallSet("RT","RF","VP-TERRACE",terraceWallRuns),
  ...wallSet("UR","RF","VP-ROOF",roofWallRuns),
];

// Associate detected openings with the nearest wall run on the same plan. This
// keeps wall net areas and finish quantities synchronized without relying on a
// manually maintained host-wall list.
const pointToWallDistance=(point:Point,wall:Wall)=>{
  const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,length2=dx*dx+dy*dy;
  const t=length2?Math.max(0,Math.min(1,((point.x-wall.start.x)*dx+(point.y-wall.start.y)*dy)/length2)):0;
  return Math.hypot(point.x-(wall.start.x+t*dx),point.y-(wall.start.y+t*dy));
};
for(const opening of OPENINGS){
  const center={x:opening.bbox.x+opening.bbox.width/2,y:opening.bbox.y+opening.bbox.height/2};
  const candidates=WALLS.filter(wall=>wall.viewportId===opening.viewportId);
  const nearest=candidates.map(wall=>({wall,distance:pointToWallDistance(center,wall)})).sort((a,b)=>a.distance-b.distance)[0];
  if(nearest&&nearest.distance<=55)opening.hostWallId=nearest.wall.id;
}
export const ROOF_FAMILIES:RoofFamily[]=[{id:"R01",mark:"R01",description:"Protected roof and roof-terrace waterproofing system",layers:"Prepared RCC slab; formed falls; membrane; insulation where scheduled; protection; finish",falls:"To coordinated roof outlets",source:"AR/04–AR/05 and final waterproofing specifications",color:"#3b82f6"},{id:"R02",mark:"R02",description:"Independent balcony waterproofing system",layers:"Waterproofing; protection; exterior finish; thresholds and upstands",falls:"To balcony outlets",source:"Final PDF p. 10",color:"#06b6d4"},{id:"R03",mark:"R03",description:"Root-resistant flower-trough waterproofing",layers:"Root-resistant membrane; protection board; drainage; geotextile",falls:"To outlet and overflow",source:"AR/04 and final waterproofing specifications",color:"#10b981"},{id:"R04",mark:"R04",description:"Water-tank and wet-risk tanking system",layers:"Cementitious / specialist tanking with reinforced junctions",falls:"To drainage point",source:"AR/05 and final waterproofing specifications",color:"#8b5cf6"}];
export const UPSTAND_FAMILIES:UpstandFamily[]=[{id:"U01",mark:"U01",description:"Waterproofed upstand",heightMm:300,source:"Section detail",color:"#0f766e"}];
const r=(id:string,familyId:string,scope:"Terrace"|"Upper roof",viewportId:string,points:any[]):RoofZone=>({id,familyId,upstandFamilyId:"U01",scope,floorId:"RF",viewportId,points,deducts:[],upstandEdges:points.map(()=>true),status:"ready"});
export const ROOF_ZONES:RoofZone[]=[
r("RZ-RT-NORTH","R01","Terrace","VP-TERRACE",[{x:397,y:568},{x:697,y:568},{x:697,y:647},{x:1192,y:647},{x:1192,y:568},{x:1497,y:568},{x:1497,y:1034},{x:1192,y:1034},{x:1192,y:793},{x:704,y:793},{x:704,y:1034},{x:397,y:1034}]),
r("RZ-RT-SOUTH","R01","Terrace","VP-TERRACE",[{x:397,y:1167},{x:704,y:1167},{x:704,y:1408},{x:1192,y:1408},{x:1192,y:1167},{x:1497,y:1167},{x:1497,y:1637},{x:1192,y:1637},{x:1192,y:1550},{x:697,y:1550},{x:697,y:1637},{x:397,y:1637}]),
r("RZ-FT-NW","R03","Terrace","VP-TERRACE",[{x:336,y:558},{x:392,y:558},{x:392,y:1041},{x:336,y:1041}]),
r("RZ-FT-NE","R03","Terrace","VP-TERRACE",[{x:1497,y:558},{x:1557,y:558},{x:1557,y:1041},{x:1497,y:1041}]),
r("RZ-FT-NC","R03","Terrace","VP-TERRACE",[{x:697,y:592},{x:1192,y:592},{x:1192,y:647},{x:697,y:647}]),
r("RZ-FT-NW-B","R03","Terrace","VP-TERRACE",[{x:397,y:1034},{x:697,y:1034},{x:697,y:1070},{x:397,y:1070}]),
r("RZ-FT-NE-B","R03","Terrace","VP-TERRACE",[{x:1192,y:1034},{x:1497,y:1034},{x:1497,y:1070},{x:1192,y:1070}]),
r("RZ-FT-SW","R03","Terrace","VP-TERRACE",[{x:336,y:1130},{x:392,y:1130},{x:392,y:1640},{x:336,y:1640}]),
r("RZ-FT-SE","R03","Terrace","VP-TERRACE",[{x:1497,y:1130},{x:1557,y:1130},{x:1557,y:1640},{x:1497,y:1640}]),
r("RZ-FT-SW-T","R03","Terrace","VP-TERRACE",[{x:397,y:1130},{x:697,y:1130},{x:697,y:1167},{x:397,y:1167}]),
r("RZ-FT-SE-T","R03","Terrace","VP-TERRACE",[{x:1192,y:1130},{x:1497,y:1130},{x:1497,y:1167},{x:1192,y:1167}]),
r("RZ-FT-SC","R03","Terrace","VP-TERRACE",[{x:697,y:1550},{x:1192,y:1550},{x:1192,y:1637},{x:697,y:1637}]),
r("RZ-UR-NORTH","R01","Upper roof","VP-ROOF",[{x:655,y:750},{x:1238,y:750},{x:1238,y:1034},{x:655,y:1034}]),
r("RZ-UR-SOUTH","R01","Upper roof","VP-ROOF",[{x:655,y:1167},{x:1238,y:1167},{x:1238,y:1452},{x:655,y:1452}]),
r("RZ-UR-TANK","R04","Upper roof","VP-ROOF",[{x:704,y:1034},{x:1060,y:1034},{x:1060,y:1160},{x:704,y:1160}]),
r("RZ-UR-MACHINE","R01","Upper roof","VP-ROOF",[{x:1060,y:1034},{x:1192,y:1034},{x:1192,y:1160},{x:1060,y:1160}]),
];
export const HEIGHTS:HeightRecord[]=[
{id:"H-GF-FF",name:"Ground to first floor",storeyId:"GF",viewportId:"VP-FRONT",yTop:1586,yBottom:1765,status:"confirmed"},
{id:"H-FF-02",name:"First to second floor",storeyId:"FF",viewportId:"VP-FRONT",yTop:1435,yBottom:1586,status:"confirmed"},
{id:"H-02-03",name:"Second to third floor",storeyId:"L02",viewportId:"VP-FRONT",yTop:1284,yBottom:1435,status:"confirmed"},
{id:"H-03-04",name:"Third to fourth floor",storeyId:"L03",viewportId:"VP-FRONT",yTop:1133,yBottom:1284,status:"confirmed"},
{id:"H-04-05",name:"Fourth to fifth floor",storeyId:"L04",viewportId:"VP-FRONT",yTop:982,yBottom:1133,status:"confirmed"},
{id:"H-05-06",name:"Fifth to sixth floor",storeyId:"L05",viewportId:"VP-FRONT",yTop:831,yBottom:982,status:"confirmed"},
{id:"H-06-RT",name:"Sixth floor to roof terrace",storeyId:"L06",viewportId:"VP-FRONT",yTop:666,yBottom:831,status:"confirmed"},
{id:"H-RT-MR",name:"Roof terrace to machine room",storeyId:"RT",viewportId:"VP-FRONT",yTop:473,yBottom:666,status:"confirmed"},
{id:"H-MR-WTR",name:"Machine room to water tank roof",storeyId:"MR",viewportId:"VP-FRONT",yTop:335,yBottom:473,status:"confirmed"},
];
export const SLABS:SlabRecord[]=[
{id:"SL-GF",storeyId:"GF",viewportId:"VP-SEC-BB",topY:1778,bottomY:1800,x0:320,x1:1460,stepX:1180,stepOffset:10,status:"confirmed"},
{id:"SL-FF",storeyId:"FF",viewportId:"VP-SEC-BB",topY:1558,bottomY:1580,x0:320,x1:1460,stepX:430,stepOffset:8,status:"confirmed"},
{id:"SL-TYP",storeyId:"TYP",viewportId:"VP-SEC-BB",topY:1098,bottomY:1120,x0:320,x1:1460,stepX:430,stepOffset:8,status:"confirmed"},
{id:"SL-RF",storeyId:"RF",viewportId:"VP-SEC-BB",topY:878,bottomY:900,x0:320,x1:1460,stepX:1180,stepOffset:8,status:"ready"},
];
export const SPECIFICATIONS:SpecificationItem[]=[
{id:"SP-DW",name:"Complete door / window schedule",category:"Openings",viewportId:"VP-SCHED",found:true,status:"confirmed",rawText:"Nineteen opening types are scheduled on AR/10. Counts, dimensions and disputed items are retained from the coordinated preliminary workbook.",columns:["Type","Location","Size (mm)","Total","Floors 1–6","Status","Description"],rows:MATTEGODA_OPENING_SCHEDULE.map(item=>[item.ref,item.location,`${Math.round(item.widthMm)} × ${Math.round(item.heightMm)}`,String(item.scheduledQty),String(item.floorsOneToSixQty),item.status,item.description])},
{id:"SP-AREA",name:"Unit floor areas",category:"Areas",viewportId:"VP-AREA",found:true,status:"confirmed",rawText:"Six apartment types repeat on the first through sixth floors, producing 36 scheduled units.",columns:["Unit type","Area","Repetition","Scheduled total"],rows:[["Type A","805 sq.ft","6","4,830 sq.ft"],["Type B","847 sq.ft","6","5,082 sq.ft"],["Type C","805 sq.ft","6","4,830 sq.ft"],["Type D","805 sq.ft","6","4,830 sq.ft"],["Type E","847 sq.ft","6","5,082 sq.ft"],["Type F","805 sq.ft","6","4,830 sq.ft"]]},
{id:"SP-FIN",name:"Schedule of finishes",category:"Finishes",viewportId:"VP-SPEC-FINISH",found:true,status:"confirmed",rawText:"The authoritative finish schedule is provided on specification pages 3–7.",columns:["Location","Floor","Wall","Ceiling / soffit"],rows:[["Living / dining / pantry","F01","W01 + W04 splashback","C01"],["Bedrooms","F01","W01","C01"],["Toilets / bathrooms","F02","W03","C02"],["Apartment balconies","F03","W05 + waterproofed upstands","C03"],["Common corridors","F04","W02","C01/C04"],["Entrance and lift lobbies","F05","W02 + selected feature finish","C04"],["Stairs and landings","F06","W02","C01"],["Gymnasium","F07","W06","C04/C05"],["Management room","F01","W01","C01/C04"],["Parking / driveway","F08","W05 / protective RCC coating","C03"],["Plant rooms","F09","W07","C06"],["Roof terrace","F10","W05 + waterproofed upstands","As applicable"],["Water-tank room","F11","W08","C07"],["Flower troughs","F12","W09","Not applicable"]]},
{id:"SP-MASONRY",name:"Masonry and wall types",category:"Walls",viewportId:"VP-SPEC-MASONRY",found:true,status:"needs_review",rawText:"Wall types are preliminary and must not be treated as load-bearing without structural confirmation.",columns:["Type","Use","Nominal thickness","Requirement"],rows:[["M01","External masonry","225 mm","Fire/acoustic/thermal confirmation required"],["M02","Apartment-separating / corridor","200/225 mm","Full slab-to-soffit tested system"],["M03","Internal apartment partition","100/115 mm","Non-load-bearing"],["M04","Wet-area partition","100/115 mm","Support sanitaryware and waterproofing"],["M05","Lift/stair/service shaft","TBC","Structural and fire consultant confirmation"],["M06","Parapet / guard wall","TBC","Structural detail, waterproofed base and coping"]]},
{id:"SP-ROOF",name:"Waterproofing and roof systems",category:"Waterproofing",viewportId:"VP-SPEC-ROOF",found:true,status:"needs_review",rawText:"Roof terrace, wet-area, balcony and flower-trough systems require coordinated specialist submissions and testing.",columns:["System","Scope","Key requirement"],rows:[["R01","Roof terrace","Protected insulated warranted system with coordinated outlets and upstands"],["R02","Balconies","Independent waterproofing at thresholds, outlets and drips"],["R03","Flower troughs","Root-resistant membrane, protection, drainage, geotextile and overflow"],["R04","Water tank / wet risk","Compatible tanking with reinforced junctions and penetrations"]]},
{id:"SP-NRM",name:"NRM 2 measurement notes",category:"Measurement",viewportId:"VP-SPEC-NRM",found:true,status:"confirmed",rawText:"Measure by element/type, separate differing materials and conditions, identify assumptions, and reconcile architectural, structural and services information before tender or construction issue."},
{id:"SP-FOUND",name:"Foundation details",category:"Structure",viewportId:"VP-FOUND",found:true,status:"needs_review",rawText:"Internal and blind wall foundation details and generic column/footing diagrams are present. They are not a complete foundation schedule and are not suitable for final structural measurement."},
{id:"SP-SITE",name:"Site plan",category:"Site",viewportId:"VP-SITE",found:true,status:"confirmed",rawText:"AR/10 contains a separate site plan at printed scale 1:1000."},
{id:"SP-COORD",name:"Drawing coordination conflicts",category:"Coordination",viewportId:"VP-SPEC-COORD",found:true,status:"needs_review",rawText:"Architectural title blocks identify a 02-bedroom apartment while structural sheets identify a 03-bedroom apartment. AR/01 is titled Typical Floor Plan although its parking content is used as the Ground viewport. Consultant confirmation is required."},
];
export const CHAT_SEED:Record<string,ChatMessage[]>={};
