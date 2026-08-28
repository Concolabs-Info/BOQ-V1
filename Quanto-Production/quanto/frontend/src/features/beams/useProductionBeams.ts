"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import type { BeamEditorState, BeamStateResponse } from "./types";
import { answerBeamQuestion, getBeamState, reanalyzeBeams, saveBeamEditor } from "./api";

function summary(editor: BeamEditorState, beams = editor.beams) {
  return {
    beamCount: beams.length,
    needsReview: beams.filter((b) => b.status === "needs_review").length,
    netLengthM: Number(beams.reduce((sum, b) => sum + Number(b.netLengthM || 0), 0).toFixed(4)),
    concreteM3: Number(beams.reduce((sum, b) => {
      const family = useStructuralStore.getState().beamFamilies.find((f) => f.id === b.familyId);
      if (!family || b.netLengthM == null) return sum;
      return sum + b.netLengthM * (family.widthMm / 1000) * (family.depthMm / 1000);
    }, 0).toFixed(4)),
  };
}

export function useProductionBeams(projectId: string) {
  const [state, setState] = useState<BeamStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydratedRun = useRef<string | null>(null);
  const saveReady = useRef(false);
  const beamFamilies = useStructuralStore((s) => s.beamFamilies);
  const beams = useStructuralStore((s) => s.beams);
  const beamDataSource = useStructuralStore((s) => s.beamDataSource);
  const replaceBeamData = useStructuralStore((s) => s.replaceBeamData);

  const load = useCallback(async () => {
    try {
      const next = await getBeamState(projectId);
      setState(next);
      setError(null);
      if (next.analysis.status === "done" && next.editor && hydratedRun.current !== next.editor.runId) {
        hydratedRun.current = next.editor.runId;
        saveReady.current = false;
        replaceBeamData(next.editor.families, next.editor.beams);
        window.setTimeout(() => { saveReady.current = true; }, 0);
      }
      return next;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Beam analysis could not be loaded";
      setError(message);
      return null;
    }
  }, [projectId, replaceBeamData]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      const next = await load();
      if (cancelled) return;
      if (!next || next.analysis.status === "running" || next.analysis.status === "idle") {
        timer = window.setTimeout(poll, 900);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [load, state?.analysis.status]);

  useEffect(() => {
    if (!state?.editor || state.analysis.status !== "done" || beamDataSource !== "production" || !saveReady.current) return;
    if (hydratedRun.current !== state.editor.runId) return;
    const timer = window.setTimeout(() => {
      const editor: BeamEditorState = {
        ...state.editor!,
        families: beamFamilies,
        beams,
        summary: summary(state.editor!, beams),
      };
      void saveBeamEditor(projectId, editor).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [beamDataSource, beamFamilies, beams, projectId, state]);

  const reanalyze = useCallback(async () => {
    try {
      hydratedRun.current = null;
      saveReady.current = false;
      const next = await reanalyzeBeams(projectId);
      setState({ analysis: next.analysis, editor: null });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Beam analysis could not be restarted");
    }
  }, [projectId]);

  const answerQuestion = useCallback(async (questionId: string, answer: string) => {
    const next = await answerBeamQuestion(projectId, questionId, answer);
    setState((current) => current ? { ...current, editor: next.editor } : current);
  }, [projectId]);

  return { state, error, reload: load, reanalyze, answerQuestion };
}
