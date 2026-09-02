import type { BBox, Point } from "./types";
export function distance(a:Point,b:Point){ return Math.hypot(b.x-a.x,b.y-a.y); }
export function polygonArea(points:Point[]){ if(points.length<3)return 0; let sum=0; for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y;} return Math.abs(sum)/2; }
export function zoneAreaM2(points:Point[], deducts:Point[][], scale:number){ return Math.max(0,(polygonArea(points)-deducts.reduce((s,d)=>s+polygonArea(d),0))*scale*scale); }
export function bboxPoints(b:BBox):Point[]{ return [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}]; }
export function centroid(points:Point[]){ return points.length?{x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length}:{x:0,y:0}; }
export function edgeLengthM(points:Point[], enabled:boolean[], scale:number){ let total=0; for(let i=0;i<points.length;i++){ if(enabled[i]!==false) total+=distance(points[i],points[(i+1)%points.length])*scale;} return total; }
