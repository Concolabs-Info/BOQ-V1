import type { BeamFamily, BeamRun } from "@/features/quanto/structuralTypes";

export type BeamAnalysisStatus = {
  status: "idle" | "blocked" | "running" | "done" | "error";
  stage: string;
  progress: number;
  message: string;
  run_id?: string;
  error?: string;
};

export type BeamPage = {
  id: string;
  pageIndex: number;
  name: string;
  title?: string | null;
  sourceDocument?: string | null;
  sourcePageNumber?: number | null;
  floorLabel?: string | null;
  width: number;
  height: number;
  scaleDenom?: number | null;
  mmPerPoint?: number | null;
  imageUrl: string;
};

export type BeamWorkbookRow = {
  id: string;
  run_id?: string;
  family: string;
  scope: string;
  calc: string;
  qty: number;
  unit: string;
  status: string;
  source?: string | Record<string, unknown> | null;
};

export type BeamQuestion = {
  id: string;
  stage: string;
  kind: string;
  text: string;
  status?: string;
  answer?: string | null;
  evidence_id?: string | null;
};

export type BeamEditorState = {
  schemaVersion: string;
  engine: string;
  runId: string;
  pages: BeamPage[];
  families: BeamFamily[];
  beams: BeamRun[];
  engineWorkbook: BeamWorkbookRow[];
  questions: BeamQuestion[];
  summary: {
    beamCount: number;
    needsReview: number;
    netLengthM: number;
    concreteM3: number;
  };
};

export type BeamStateResponse = {
  analysis: BeamAnalysisStatus;
  editor: BeamEditorState | null;
};
