import { useEffect, useLayoutEffect, useRef } from 'react';
import { BREW_METHODS } from '../lib/brewMethods';
import {
  brewActivityAttributes,
  buildBrewActivity,
  endBrewActivity,
  onRateCupTapped,
  publishBrewActivity,
  requestBrewAlertPermission,
} from '../lib/brewLiveActivity';

const methodLabel = (context) => {
  if (context?.v60Variant === 'switch') return 'Switch';
  return BREW_METHODS[context?.device]?.label?.replace(/ Recipe$/, '') || null;
};

// Mirrors the open brew timer on the Dynamic Island and Lock Screen.
// Publishes on transitions only (phase, step, source readiness, chill).
export function useBrewLiveActivity({ open, timer, recipe, bean, sessionRef, attemptId, chilled, onRateCup }) {
  const { phase, stepIndex, timerSteps } = timer;
  const sourceStatus = timer.sourceReadiness?.status || null;
  const sourceActive = Boolean(timer.sourceActive);
  // Same rule as the in-app chill screen.
  const iced = Boolean(recipe?.isIced);
  const latest = useRef(null);
  // Layout effects run before the effects below, so they read this render.
  useLayoutEffect(() => {
    latest.current = { timer, recipe, bean, sessionRef, attemptId, iced, onRateCup };
  });
  const publishedRef = useRef(false);

  // iOS asks once; later calls return at once. Asking as the timer opens
  // lets the first brew already buzz at each pour.
  useEffect(() => {
    if (open) requestBrewAlertPermission();
  }, [open]);

  useEffect(() => {
    const { timer: t, recipe: r, bean: b, sessionRef: s, attemptId: id, iced: isIced } = latest.current;
    const activity = open ? buildBrewActivity({
      phase,
      stepIndex,
      timerSteps,
      globalElapsedMs: t.readGlobalMs(),
      stepElapsedMs: t.readStepMs(),
      currentStepDurationMs: t.currentStepDurationMs,
      totalMs: t.totalMs,
      confirmedSource: t.sourceMode === 'confirmed',
      sourceReadiness: t.sourceReadiness,
      sourceActive,
      completionElapsedMs: t.completionElapsedMs,
      completionAtMs: t.completionAtMs,
      iced: isIced,
      chilled,
      chillNote: r?.postBrewSteps?.[0]?.action,
    }) : null;
    if (!activity) {
      if (publishedRef.current) endBrewActivity();
      publishedRef.current = false;
      return;
    }
    const context = s.current;
    publishBrewActivity(brewActivityAttributes({
      sessionId: context?.sessionId || id,
      beanName: b?.name || b?.roasterName || null,
      methodLabel: methodLabel(context),
      doseGrams: context?.doseGrams,
      iced: isIced,
    }), activity);
    publishedRef.current = true;
  }, [open, phase, stepIndex, timerSteps, sourceStatus, sourceActive, chilled]);

  useEffect(() => () => {
    if (publishedRef.current) endBrewActivity();
  }, []);

  const canRate = Boolean(onRateCup);
  useEffect(() => {
    if (!open || phase !== 'done' || !canRate) return undefined;
    return onRateCupTapped(() => latest.current.onRateCup?.());
  }, [open, phase, canRate]);
}
