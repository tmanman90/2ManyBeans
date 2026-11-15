// Ties the scale to one brew: pair, tare, listen for the bloom pour, live
// targets with chime + haptic, and the summary saved with the brew. Time still
// drives the steps; the scale only starts the clock and measures the water.
//
// Stage, derived each render:
//   none        no scale for this brew (web, declined, or not set up)
//   pair        the pair sheet is open
//   connecting  connecting to the chosen or remembered scale
//   lost        could not connect, or connected but silent
//   tare        connected, waiting for Tare
//   listening   tared, the clock starts on the first pour
//   live        the brew is running with the scale

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScale } from './useScale';
import { haptic } from '../lib/haptics';
import { playChime, unlockChime } from '../lib/scale/chime';
import {
  activePour,
  buildScaleSummary,
  detectFirstPour,
  flowRate,
  pourTargets,
  TARGET_REACHED_G,
} from '../lib/scale/scaleSession';

const STARTED_TOAST_MS = 3500;

export function useScaleBrew({ open, phase, stepIndex, timerSteps, doseGrams, beginRunning, canHold }) {
  const targets = useMemo(() => pourTargets(timerSteps), [timerSteps]);
  const pourPlan = useMemo(() => targets.map((target) => ({ atSec: target.startSeconds, toG: target.targetG })), [targets]);
  const scale = useScale(open, { pourPlan });

  const [pairOpen, setPairOpen] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [tared, setTared] = useState(false);
  const [live, setLive] = useState(false);
  const [startedToast, setStartedToast] = useState(false);
  const [flow, setFlow] = useState(0);
  const [reached, setReached] = useState({});
  const [poured, setPoured] = useState({});
  const [summary, setSummary] = useState(null);
  const startAtRef = useRef(null);
  const reachedRef = useRef({});
  const summaryRef = useRef(null);

  useEffect(() => {
    if (open) return;
    setPairOpen(false);
    setOptedOut(false);
    setTared(false);
    setLive(false);
    setStartedToast(false);
    setFlow(0);
    setReached({});
    setPoured({});
    setSummary(null);
    startAtRef.current = null;
    reachedRef.current = {};
    summaryRef.current = null;
  }, [open]);

  const prebrew = phase === 'idle' || phase === 'countdown';
  let stage = 'none';
  if (prebrew && canHold) {
    if (pairOpen) stage = 'pair';
    else if (!optedOut && scale.available) {
      const status = scale.status;
      if (status === 'connecting' || (status === 'idle' && scale.device)) stage = 'connecting';
      else if (status === 'lost' || status === 'silent') stage = 'lost';
      else if (status === 'connected') stage = tared ? 'listening' : 'tare';
    }
  } else if (!prebrew && live) {
    stage = 'live';
  }

  const startBrew = useCallback((atMs, onPour) => {
    startAtRef.current = atMs;
    reachedRef.current = {};
    setReached({});
    setLive(true);
    setStartedToast(onPour);
    haptic.heavy().catch(() => {});
    beginRunning(atMs);
  }, [beginRunning]);

  // Listening: start the clock on the bloom pour, back-dated to its first drop.
  useEffect(() => {
    if (stage !== 'listening') return;
    const atMs = detectFirstPour(scale.samplesRef.current);
    if (atMs != null) startBrew(atMs, true);
  }, [stage, scale.grams, scale.samplesRef, startBrew]);

  useEffect(() => {
    if (!startedToast) return undefined;
    const id = setTimeout(() => setStartedToast(false), STARTED_TOAST_MS);
    return () => clearTimeout(id);
  }, [startedToast]);

  // Live: flow, and one chime + haptic when each pour reaches its target.
  const target = activePour(targets, stepIndex);
  useEffect(() => {
    if (stage !== 'live' || scale.grams == null) return;
    setFlow(flowRate(scale.samplesRef.current));
    if (phase !== 'running' || !target || reachedRef.current[target.stepIndex]) return;
    if (scale.grams < target.targetG - TARGET_REACHED_G) return;
    reachedRef.current = { ...reachedRef.current, [target.stepIndex]: Date.now() };
    setReached(reachedRef.current);
    haptic.heavy().catch(() => {});
    playChime(target === targets[targets.length - 1]);
  }, [stage, phase, scale.grams, scale.samplesRef, target, targets]);

  // When the clock moves on to the next pour, keep what the last one reached.
  const gramsRef = useRef(null);
  useEffect(() => { gramsRef.current = scale.grams; }, [scale.grams]);
  const previousTargetRef = useRef(null);
  useEffect(() => {
    const previous = previousTargetRef.current;
    previousTargetRef.current = stage === 'live' ? target : null;
    if (stage !== 'live' || !previous || previous === target || !Number.isFinite(gramsRef.current)) return;
    setPoured((current) => ({ ...current, [previous.stepIndex]: gramsRef.current }));
  }, [stage, target]);

  // Built once when the brew finishes; a retry of the save reuses it.
  const finishSummary = useCallback((finishAtMs) => {
    if (!live || startAtRef.current == null) return null;
    if (summaryRef.current) return summaryRef.current;
    const built = buildScaleSummary({
      samples: scale.samplesRef.current,
      firstWaterAtMs: startAtRef.current,
      finishAtMs,
      targets,
      reachedAtMs: reachedRef.current,
      model: scale.device?.model,
      protocol: scale.protocol,
      doseGrams,
    });
    summaryRef.current = built;
    setSummary(built);
    return built;
  }, [live, scale.samplesRef, scale.device, scale.protocol, targets, doseGrams]);

  const openPair = useCallback(() => {
    setOptedOut(false);
    setPairOpen(true);
    scale.startScan();
  }, [scale]);

  const brewWithoutScale = useCallback(() => {
    scale.stopScan();
    setPairOpen(false);
    setOptedOut(true);
    if (!['connected', 'connecting'].includes(scale.status)) return;
    scale.release();
  }, [scale]);

  const chooseScale = useCallback((device) => {
    setPairOpen(false);
    setTared(false);
    scale.choose(device);
  }, [scale]);

  const tare = useCallback(() => {
    unlockChime();
    haptic.medium().catch(() => {});
    scale.tare().catch(() => {});
    setTared(true);
  }, [scale]);

  const startNow = useCallback(() => {
    unlockChime();
    startBrew(Date.now(), false);
  }, [startBrew]);

  return {
    scale,
    stage,
    holdStart: prebrew && stage !== 'none',
    targets,
    target,
    reached,
    poured,
    flow,
    startedToast,
    summary,
    finishSummary,
    openPair,
    closePair: brewWithoutScale,
    startWithoutScale: brewWithoutScale,
    chooseScale,
    tare,
    startNow,
  };
}
