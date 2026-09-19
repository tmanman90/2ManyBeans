// Source-backed brew guide. This is deliberately separate from BrewTimer:
// source schedules contain authored event anchors and may use grams and mL in
// the same record. Passage of time only changes the view; every stage and
// valve action is confirmed by the brewer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Droplets, Info, Play, RotateCcw, X } from 'lucide-react';
import { C, fonts, glass, radius, shadows, type } from '../styles/theme';
import { formatTimingMs } from '../lib/brewTimingMemory';
import { useManualSourceBrewTimer, sourceTimerIdentity } from '../hooks/useManualSourceBrewTimer';
import { manualSourceDisplay, validateManualSourceProjection } from '../lib/manualSourceProjection.js';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';

const buttonStyle = {
  minHeight: 48,
  borderRadius: radius.md,
  padding: '12px 16px',
  fontFamily: fonts.body,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  border: `1px solid ${C.border}`,
  background: C.cream,
  color: C.text,
  width: '100%',
  WebkitTapHighlightColor: 'transparent',
};

const primaryButtonStyle = {
  ...buttonStyle,
  background: `linear-gradient(160deg, #C4844A 0%, ${C.accent} 100%)`,
  color: '#FFF8F0',
  borderColor: C.accent,
  boxShadow: `${shadows.button}, 0 4px 14px rgba(168,106,56,0.22)`,
};

const clockLabel = (origin) => {
  if (origin === 'after-bloom-pour') return 'after the bloom pour finishes';
  if (origin === 'after-main-pour') return 'after the main pour finishes';
  if (origin === 'first-water') return 'from the first water';
  return 'source clock not specified';
};

const formatSourceTime = (seconds) => Number.isFinite(seconds) ? formatTimingMs(seconds * 1000) : null;

const titleForProjection = (projection) => projection?.sourceSnapshot?.title
  || projection?.sourceExecution?.title
  || projection?.sourceLineage?.title
  || 'Source brew guide';

const quantityForStage = (stage) => {
  if (stage?.water?.value != null && stage?.water?.unit) return { value: stage.water.value, unit: stage.water.unit };
  if (stage?.waterToGrams != null) return { value: stage.waterToGrams, unit: 'g' };
  if (stage?.waterToMilliliters != null) return { value: stage.waterToMilliliters, unit: 'mL' };
  return null;
};

const quantityForProjection = (projection) => projection?.water?.value == null
  ? null
  : { value: projection.water.value, unit: projection.water.unit };

const sourceConfigurationLabel = (projection) => {
  const configuration = projection?.sourceConfiguration || projection?.equipment || {};
  const brewer = configuration.device === 'v60' && configuration.variant === 'switch'
    ? 'V60 Switch'
    : configuration.device || configuration.brewer || 'source brewer';
  const size = configuration.size ? ` ${configuration.size}` : '';
  const mode = projection?.mode === 'iced' ? ' · iced' : ' · hot';
  return `${brewer}${size}${mode}`;
};

const stageKindLabel = (stage) => ({
  pour: 'Pour',
  valve: 'Valve',
  agitate: 'Action',
  press: 'Press',
  dilute: 'Dilute',
  finish: 'Finish',
}[stage?.kind] || 'Action');

const stageStartLabel = (stage, index) => {
  if (stage?.kind === 'valve') return `Begin ${stage.valve === 'open' ? 'opening' : 'closing'} the valve`;
  if (stage?.kind === 'finish') return 'Begin drawdown check';
  if (stage?.kind === 'pour') return index === 0 ? 'Start first pour' : 'Begin pour';
  return `Begin ${stageKindLabel(stage).toLowerCase()}`;
};

const stageCompleteLabel = (stage) => {
  if (stage?.kind === 'valve') return `Confirm valve ${stage.valve || 'position'}`;
  if (stage?.kind === 'finish') return 'Drawdown complete';
  if (stage?.kind === 'pour') return 'Pour finished';
  return 'Action finished';
};

const triggerLabel = (stage, record) => {
  const trigger = stage?.trigger;
  if (!trigger) return null;
  if (trigger.type === 'elapsed') {
    const time = formatSourceTime(trigger.seconds);
    return time ? `At ${time} ${clockLabel(record?.clock?.origin)}` : null;
  }
  if (trigger.type === 'after') {
    const event = String(trigger.event || '').replace(/:complete$/, '').replace(/[-_]/g, ' ');
    const time = formatSourceTime(trigger.seconds);
    return time === '0:00' ? `Immediately after ${event} finishes` : `${time} after ${event} finishes`;
  }
  if (trigger.type === 'condition') return `When observed: ${trigger.condition}`;
  if (trigger.type === 'manual') return 'Begin when ready';
  return null;
};

const stageStatus = (record, state, stage, index) => {
  if (Object.hasOwn(state.events, `${stage.id}:complete`)) return 'complete';
  if (state.activeStageId === stage.id) return 'active';
  const previous = record.stages[index - 1];
  if (previous && !Object.hasOwn(state.events, `${previous.id}:complete`)) return 'upcoming';
  return 'next';
};

function SourceStageTimeline({ record, state, activeStageId, displayStages }) {
  const displayById = new Map((displayStages || []).map((stage) => [stage.id, stage]));
  return (
    <ol aria-label="Source brew stages" style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
      {record.stages.map((stage, index) => {
        const status = stageStatus(record, state, stage, index);
        const displayStage = displayById.get(stage.id) || stage;
        const quantity = quantityForStage(displayStage);
        return (
          <li
            key={stage.id}
            data-stage-id={stage.id}
            data-stage-status={status}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: radius.md,
              background: status === 'active' ? C.amberBg : C.cream,
              border: `1px solid ${status === 'active' ? C.accentLight : C.borderLight}`,
              opacity: status === 'upcoming' ? 0.66 : 1,
              boxShadow: status === 'active' ? shadows.e1 : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                flexShrink: 0,
                borderRadius: '50%',
                background: status === 'complete' ? C.greenBg : status === 'active' ? C.accentSoft : C.bgDeep,
                color: status === 'complete' ? C.green : status === 'active' ? C.accent : C.textMuted,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {status === 'complete' ? <Check size={14} strokeWidth={3} /> : index + 1}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <strong style={{ ...type.body, color: C.text }}>{displayStage.label}</strong>
                <span style={{ ...type.caption, color: C.textMuted, whiteSpace: 'nowrap' }}>{stageKindLabel(stage)}</span>
              </div>
              {(quantity || stage.valve) && (
                <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>
                  {quantity && <span>{quantity.value}{quantity.unit}</span>}
                  {quantity && stage.valve && <span> · </span>}
                  {stage.valve && <span>Valve {stage.valve}</span>}
                </div>
              )}
              {activeStageId === stage.id && status === 'active' && (
                <div style={{ ...type.caption, color: C.accent, marginTop: 4 }}>In progress — confirm when physically finished</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SourceTimerUnavailable({ projection, onClose, reason }) {
  const source = projection?.sourceSnapshot || projection?.sourceExecution;
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="source-timer-unavailable-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        overflowY: 'auto',
        background: C.bg,
        color: C.text,
        fontFamily: fonts.body,
        padding: 'calc(env(safe-area-inset-top, 0px) + 20px) calc(env(safe-area-inset-right, 0px) + 20px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 20px)',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <div style={{ ...type.label, color: C.textMuted }}>Source guide</div>
        <h1 id="source-timer-unavailable-title" style={{ ...type.h1, margin: 0 }}>{source?.title || 'Source recipe'}</h1>
        <div role="alert" style={{ background: C.amberBg, border: `1px solid ${C.accentLight}`, borderRadius: radius.lg, padding: 16, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Info size={18} color={C.accent} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{reason || 'This source is readable, but it is not ready for guided timing.'}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} style={primaryButtonStyle}>Close guide</button>
      </div>
    </div>,
    document.body,
  );
}

function SourceTimerSession({ projection, sourceTimerBinding, initialState, onStateChange, onClose, onStartTasting, onSaveTimingEvent, bean, attemptId = null, revisionId = null }) {
  const record = projection.sourceExecution;
  const source = projection.sourceSnapshot || record;
  const binding = useMemo(() => ({
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceConfiguration: projection.sourceConfiguration,
    configurationKey: projection.configurationKey,
    fingerprint: projection.sourceFingerprint || null,
    dose: projection.coffeeGrams,
    ...(sourceTimerBinding || {}),
  }), [projection, sourceTimerBinding]);
  const timer = useManualSourceBrewTimer(record, {
    initialState,
    onStateChange,
    sourceIdentity: binding,
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveState, setSaveState] = useState(null);
  const [aftercareDone, setAftercareDone] = useState(false);
  const sessionRef = useRef(null);
  const reportedRef = useRef(false);
  const savingRef = useRef(false);
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);

  const { stage, readiness, active, elapsedMs, sourceElapsedMs, events, corrections, canUndo, running, done, state, restoration, act } = timer;
  const display = useMemo(() => manualSourceDisplay(projection), [projection]);
  const displayStages = display.stages;
  const displayById = useMemo(() => new Map(displayStages.map((displayStage) => [displayStage.id, displayStage])), [displayStages]);
  const displayStage = stage ? (displayById.get(stage.id) || stage) : null;
  const stageIndex = stage ? record.stages.indexOf(stage) : record.stages.length;
  const totalStageCount = record.stages.length;
  const stageQuantity = quantityForStage(displayStage);
  const sourceWater = quantityForProjection({ ...projection, water: display.water });
  const sourceFinishTargetMs = Number.isFinite(projection.finish?.maxSeconds) && projection.finish.maxSeconds > 0
    ? projection.finish.maxSeconds * 1000
    : null;

  const device = projection.sourceConfiguration?.device || projection.equipment?.brewer || record.equipment?.brewer || 'v60';
  const mode = projection.mode === 'iced' ? 'iced' : 'hot';
  const sourceFingerprint = binding.fingerprint || binding.sourceFingerprint || null;

  useEffect(() => {
    if (!sessionRef.current) {
      sessionRef.current = {
        sessionId: attemptId || `source-${projection.sourceId}-${projection.sourceRevision}`,
        attemptId,
        revisionId,
        beanId: bean?.id || null,
        device,
        mode,
        doseGrams: projection.coffeeGrams,
        configurationKey: projection.configurationKey || null,
        createdAt: Date.now(),
        lineage: {
          profile: `source:${projection.sourceId}@${projection.sourceRevision}`,
          engineVersion: projection.projectionVersion || null,
          rulesVersion: projection.sourceRecordVersion == null ? null : String(projection.sourceRecordVersion),
          sourceContextHash: sourceFingerprint,
          sourceRegistryVersion: null,
          configurationKey: projection.configurationKey || null,
          technique: null,
          phaseContractVersion: null,
        },
      };
    }
  }, [attemptId, bean?.id, device, mode, projection, revisionId, sourceFingerprint]);

  const persistCompletion = useCallback(async () => {
    if (savingRef.current) return;
    if (!onSaveTimingEvent || !sessionRef.current) {
      setSaveState('ephemeral');
      return;
    }
    savingRef.current = true;
    setSaveState('saving');
    try {
      const result = await onSaveTimingEvent({
        ...sessionRef.current,
        actualElapsedMs: elapsedMs,
        targetMs: sourceFinishTargetMs,
        completionKind: 'userFinished',
        timingRecordVersion: 2,
        sourceId: projection.sourceId,
        sourceRevision: projection.sourceRevision,
        sourceConfiguration: projection.sourceConfiguration,
        clockOrigin: record.clock?.origin || null,
        sourceEvents: { ...events },
        sourceCorrections: [...corrections],
      });
      setSaveState(result?.status || 'ephemeral');
    } catch {
      setSaveState('failed');
    } finally {
      savingRef.current = false;
    }
  }, [corrections, elapsedMs, events, onSaveTimingEvent, projection, record.clock?.origin, sourceFinishTargetMs]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    void persistCompletion();
  }, [done, persistCompletion]);

  useEffect(() => {
    if (!running) return undefined;
    void acquireWakeLock();
    const refresh = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      void releaseWakeLock();
    };
  }, [running]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const requestClose = useCallback(() => {
    if (running) setConfirmClose(true);
    else if (saveState !== 'saving') onClose?.();
  }, [onClose, running, saveState]);

  const keyboard = useCallback((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (confirmClose) setConfirmClose(false);
      else requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const targets = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href]') || [])
      .filter((target) => target.getClientRects().length);
    const first = targets[0];
    const last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, [confirmClose, requestClose]);

  const readinessText = useMemo(() => {
    if (!stage || !readiness) return null;
    if (active) return 'In progress. Confirm this action only when you have physically finished it.';
    if (readiness.status === 'countdown') {
      return `${formatTimingMs(readiness.remainingMs)} until the source checkpoint. You may begin when ready; the guide will not act for you.`;
    }
    if (readiness.status === 'checkpoint-passed') return 'The source checkpoint has passed. Begin when ready; no action was recorded automatically.';
    if (readiness.status === 'awaiting-observation') return `Watch for: ${readiness.condition}. Confirm only when you see it.`;
    if (readiness.status === 'waiting-for-event') return 'Waiting for the source anchor event to be confirmed.';
    if (readiness.status === 'waiting-for-previous') return 'Finish the previous source action before beginning this one.';
    return 'Ready when you are.';
  }, [active, readiness, stage]);

  const sourceClockText = record.clock?.origin && record.clock.origin !== 'first-water'
    ? sourceElapsedMs == null ? `Source clock starts ${clockLabel(record.clock.origin)}.` : `${formatTimingMs(sourceElapsedMs)} ${clockLabel(record.clock.origin)}.`
    : 'The source clock starts with the first water.';

  const aftercare = Array.isArray(projection.aftercare) ? projection.aftercare : [];
  const completionStatus = saveState === 'saving'
    ? 'Saving brew timing…'
    : saveState === 'saved'
      ? 'Brew timing saved.'
      : saveState === 'failed'
        ? 'Timing was not saved. You can retry.'
        : 'Brew timing is recorded in this attempt.';

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-source-timer-title"
      onKeyDown={keyboard}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        overflowY: 'auto',
        background: C.bg,
        color: C.text,
        fontFamily: fonts.body,
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) calc(env(safe-area-inset-right, 0px) + 20px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 20px)',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...type.label, color: C.accent, marginBottom: 5 }}>Source guide</div>
            <h1 id="manual-source-timer-title" style={{ ...type.h1, margin: 0 }}>{titleForProjection(projection)}</h1>
            <div style={{ ...type.caption, color: C.textMuted, marginTop: 5 }}>{sourceConfigurationLabel(projection)}</div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close source brew timer"
            onClick={requestClose}
            disabled={saveState === 'saving'}
            style={{ ...buttonStyle, width: 44, minWidth: 44, padding: 8, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {restoration?.accepted === false && (
          <div role="alert" style={{ ...type.body, color: C.text, background: C.amberBg, border: `1px solid ${C.accentLight}`, borderRadius: radius.md, padding: '10px 12px' }}>
            Saved source-timer progress was rejected because it no longer matches this source/configuration. The guide starts a fresh bound ledger; no old action was replayed.
          </div>
        )}

        {confirmClose ? (
          <section aria-label="Leave source brew timer" style={{ display: 'grid', gap: 12, background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg, padding: 18, boxShadow: shadows.e1 }}>
            <div style={{ ...type.h2 }}>Leave this timer?</div>
            <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.5 }}>Your confirmed actions stay with this brew attempt. Nothing will open, close, pour, or finish while you are away.</div>
            <button type="button" onClick={() => setConfirmClose(false)} style={primaryButtonStyle}>Keep brewing</button>
            <button type="button" onClick={() => { setConfirmClose(false); onClose?.(); }} style={buttonStyle}>Leave and resume later</button>
          </section>
        ) : (
          <>
            <section aria-label="Brew elapsed time" style={{ background: `linear-gradient(160deg, ${C.roast} 0%, ${C.roastDeep} 100%)`, color: '#FFF8F0', borderRadius: radius.xl, padding: '22px 20px 20px', boxShadow: shadows.e2 }}>
              <div style={{ ...type.label, color: C.accentLight, marginBottom: 7 }}>Elapsed since first water</div>
              <div aria-label={`Source brew elapsed ${formatTimingMs(elapsedMs)}`} style={{ fontFamily: fonts.heading, fontSize: 62, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{formatTimingMs(elapsedMs)}</div>
              <div style={{ ...type.body, color: 'rgba(255,248,240,0.75)', marginTop: 10 }}>{sourceClockText}</div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: sourceWater ? '1fr 1fr' : '1fr', gap: 8 }}>
              <div style={{ background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.md, padding: '11px 12px', boxShadow: shadows.e1 }}>
                <div style={{ ...type.label, color: C.textMuted }}>Source water</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.text, marginTop: 3 }}>{sourceWater ? `${sourceWater.value}${sourceWater.unit}` : 'Not specified'}</div>
              </div>
              <div style={{ background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.md, padding: '11px 12px', boxShadow: shadows.e1 }}>
                <div style={{ ...type.label, color: C.textMuted }}>Coffee</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.text, marginTop: 3 }}>{projection.coffeeGrams == null ? 'Source amount' : `${projection.coffeeGrams}g`}</div>
              </div>
            </div>

            {done ? (
              <section aria-label="Brew complete" style={{ display: 'grid', gap: 12, background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: radius.lg, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.green, color: C.cream }}><Check size={20} strokeWidth={3} /></span>
                  <div>
                    <div style={{ ...type.h2 }}>Brew complete</div>
                    <div style={{ ...type.caption, color: C.textMuted, marginTop: 2 }}>Actual elapsed time: {formatTimingMs(elapsedMs)}</div>
                  </div>
                </div>
                <div role="status" aria-live="polite" style={{ ...type.body, color: C.text }}>{completionStatus}</div>
                {saveState === 'failed' && <button type="button" onClick={() => void persistCompletion()} style={buttonStyle}>Retry timing save</button>}
                {aftercare.length > 0 && !aftercareDone ? (
                  <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${C.green}33`, paddingTop: 12 }}>
                    <div style={{ ...type.h3 }}>Finish serving</div>
                    {aftercare.map((instruction, index) => <div key={index} style={{ ...type.body, color: C.text }}>{instruction}</div>)}
                    <div style={{ ...type.caption, color: C.textMuted }}>Serving is untimed and does not change the drawdown.</div>
                    <button type="button" onClick={() => setAftercareDone(true)} style={primaryButtonStyle}>Serving complete</button>
                  </div>
                ) : (
                  <>
                    {onStartTasting && <button type="button" onClick={() => onStartTasting(bean?.id, attemptId)} disabled={saveState === 'saving'} style={primaryButtonStyle}>Start tasting session</button>}
                    <button type="button" onClick={onClose} disabled={saveState === 'saving'} style={buttonStyle}>Done</button>
                  </>
                )}
              </section>
            ) : stage ? (
              <section aria-label={`Current source stage ${stageIndex + 1} of ${totalStageCount}`} style={{ display: 'grid', gap: 12, background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg, padding: 18, boxShadow: shadows.e1 }}>
                <div style={{ ...type.label, color: C.textMuted }}>Step {stageIndex + 1} of {totalStageCount}</div>
                <div>
                  <h2 style={{ ...type.h2, margin: 0 }}>{displayStage.label}</h2>
                  {displayStage.geometry && <div style={{ ...type.body, color: C.textMuted, marginTop: 8 }}>{displayStage.geometry}</div>}
                  {displayStage.agitation && displayStage.agitation !== displayStage.geometry && <div style={{ ...type.body, color: C.textMuted, marginTop: 5 }}>{displayStage.agitation}</div>}
                </div>
                {(stageQuantity || stage.valve) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {stageQuantity && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.amberBg, border: `1px solid ${C.accentLight}`, borderRadius: radius.pill, padding: '7px 11px', fontWeight: 800 }}><Droplets size={15} color={C.accent} aria-hidden="true" /> {stageQuantity.value}{stageQuantity.unit}</div>}
                    {stage.valve && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: radius.pill, padding: '7px 11px', fontWeight: 800 }}>Valve {stage.valve}</div>}
                  </div>
                )}
                {triggerLabel(stage, record) && <div style={{ ...type.caption, color: C.textMuted, display: 'flex', alignItems: 'flex-start', gap: 6 }}><Clock3 size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /> {triggerLabel(stage, record)}</div>}
                <div role="status" aria-live="polite" style={{ background: C.bg, borderRadius: radius.md, padding: '10px 12px', color: C.text, lineHeight: 1.45 }}>{readinessText}</div>
                {Number.isFinite(stage.durationSeconds) && <div style={{ ...type.caption, color: C.textMuted }}>Source action duration: about {stage.durationSeconds} seconds. Confirm when you actually finish.</div>}
                {active ? (
                  <button type="button" onClick={() => act('complete')} style={primaryButtonStyle}><Check size={17} aria-hidden="true" /> {stageCompleteLabel(stage)}</button>
                ) : (
                  <button type="button" disabled={!readiness || !['ready', 'checkpoint-passed', 'awaiting-observation'].includes(readiness.status)} onClick={() => act('start')} style={{ ...primaryButtonStyle, opacity: readiness && ['ready', 'checkpoint-passed', 'awaiting-observation'].includes(readiness.status) ? 1 : 0.5 }}><Play size={17} fill="currentColor" aria-hidden="true" /> {stageStartLabel(stage, stageIndex)}</button>
                )}
              </section>
            ) : (
              <section aria-label="Finish source brew" style={{ display: 'grid', gap: 12, background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg, padding: 18, boxShadow: shadows.e1 }}>
                <div style={{ ...type.label, color: C.textMuted }}>All source actions confirmed</div>
                <h2 style={{ ...type.h2, margin: 0 }}>{record.equipment?.brewer === 'french-press' ? 'Decant the coffee' : 'Finish the drawdown'}</h2>
                <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.5 }}>{record.equipment?.brewer === 'french-press' ? 'Pour the coffee out of the press to separate it from the grounds, then confirm.' : 'Watch the coffee and confirm when drainage is complete. The guide does not stop the brew automatically.'}</div>
                {projection.finish && <div style={{ ...type.caption, color: C.textMuted }}>Source finish guide: {formatTimingMs(projection.finish.minSeconds * 1000)}{projection.finish.maxSeconds !== projection.finish.minSeconds ? `–${formatTimingMs(projection.finish.maxSeconds * 1000)}` : ''} {clockLabel(record.clock?.origin)}.</div>}
                <button type="button" onClick={() => act('finish')} style={primaryButtonStyle}><Check size={17} aria-hidden="true" /> Drawdown complete</button>
              </section>
            )}

            {!done && canUndo && <button type="button" onClick={() => act('undo')} style={buttonStyle}><RotateCcw size={16} aria-hidden="true" /> Undo last finish confirmation</button>}

            <SourceStageTimeline record={record} state={state} activeStageId={stage?.id || null} displayStages={displayStages} />
          </>
        )}

        <footer style={{ borderTop: `1px solid ${glass.chromeBorder}`, paddingTop: 14 }}>
          <div style={{ ...type.caption, color: C.textMuted, lineHeight: 1.45 }}>
            This guide records your confirmations only. It never operates a valve or completes a stage because time passed.
          </div>
          {source?.source?.url && <a href={source.source.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', minHeight: 44, padding: '10px 0 0', color: C.accent, fontWeight: 700 }}>View source: {source.author || 'source record'}</a>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function ManualSourceBrewTimer({ open = true, projection, sourceTimerState = null, onSourceTimerStateChange, sourceTimerBinding = null, ...props }) {
  if (!open) return null;
  const checked = validateManualSourceProjection(projection);
  if (!checked.valid) {
    return <SourceTimerUnavailable projection={projection} onClose={props.onClose} reason="This source projection no longer matches its immutable source record. Close the guide and refresh the recipe." />;
  }
  if (projection.timerReady !== true) {
    return <SourceTimerUnavailable projection={projection} onClose={props.onClose} reason="This source is readable, but its timing or configuration is not ready for guided execution. Start is unavailable." />;
  }

  let identityError = null;
  const binding = {
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceConfiguration: projection.sourceConfiguration,
    configurationKey: projection.configurationKey,
    fingerprint: projection.sourceFingerprint || null,
    dose: projection.coffeeGrams,
    ...(sourceTimerBinding || {}),
  };
  try {
    sourceTimerIdentity(projection.sourceExecution, binding);
  } catch (error) {
    identityError = error;
  }
  if (identityError) {
    return <SourceTimerUnavailable projection={projection} onClose={props.onClose} reason="This source timer is bound to a different source or configuration. Refresh before starting it." />;
  }

  return (
    <SourceTimerSession
      {...props}
      projection={projection}
      sourceTimerBinding={sourceTimerBinding}
      initialState={sourceTimerState}
      onStateChange={onSourceTimerStateChange}
    />
  );
}
