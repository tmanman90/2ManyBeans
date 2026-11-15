// Before the clock starts, with a scale (mockups 02 and 03): connecting,
// tare, and listening for the bloom pour. Covers the stage like the 3-2-1
// countdown it replaces.

import { C, fonts, radius, shadows } from '../../styles/theme';
import { BigGrams, PourChips, RingLabel, RingSub, ScaleHint, ScaleRing } from './ScaleParts';

function PrimaryButton({ onClick, children, quiet = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', minHeight: 54, borderRadius: 16, fontFamily: fonts.body, fontSize: 17, fontWeight: 800, cursor: 'pointer',
        background: quiet ? C.card : C.accent, color: quiet ? C.text : '#fff',
        border: quiet ? `1px solid ${C.border}` : 'none', boxShadow: quiet ? 'none' : shadows.navActive,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: '100%', minHeight: 44, border: 'none', background: 'transparent', color: C.textMuted, fontFamily: fonts.body, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

export function ScalePrebrew({ stage, scale, doseGrams, iced, firstStep, targets, onTare, onStartNow, onStartWithout, onRetry }) {
  let ring;
  let title;
  let body;
  let actions;

  if (stage === 'connecting' || stage === 'lost') {
    const silent = scale.status === 'silent';
    ring = (
      <ScaleRing dashed>
        <RingLabel color={stage === 'lost' ? C.amber : C.accent}>{stage === 'lost' ? (silent ? 'No weight' : 'Not found') : 'Connecting'}</RingLabel>
        <div style={{ fontFamily: fonts.heading, fontSize: 30, fontWeight: 600, color: C.text, marginTop: 6 }}>{scale.device?.model || 'Scale'}</div>
      </ScaleRing>
    );
    title = stage === 'lost' ? (silent ? 'Connected but silent' : 'Scale not found') : 'Finding your scale';
    body = stage === 'lost'
      ? 'Wake the scale by pressing its button and keep the phone close.'
      : 'Wake the scale by pressing its button.';
    actions = (
      <>
        {stage === 'lost' && <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>}
        <GhostButton onClick={onStartWithout}>Start without the scale</GhostButton>
      </>
    );
  } else if (stage === 'tare') {
    ring = (
      <ScaleRing progress={0}>
        <RingLabel color={C.textLight}>On the scale</RingLabel>
        <BigGrams grams={scale.grams} />
        <RingSub>server, dripper, filter, coffee</RingSub>
      </ScaleRing>
    );
    title = 'Tare to start';
    body = `Put the server, dripper, rinsed filter and ${Number.isFinite(doseGrams) ? `${doseGrams} g of ` : ''}coffee on the scale.${iced ? ' Add the ice to the server first.' : ''} Then tap Tare.`;
    actions = (
      <>
        <PrimaryButton onClick={onTare}>Tare</PrimaryButton>
        <GhostButton onClick={onStartWithout}>Start without the scale</GhostButton>
      </>
    );
  } else {
    ring = (
      <ScaleRing dashed>
        <RingLabel>Listening</RingLabel>
        <BigGrams grams={Math.max(0, scale.grams ?? 0)} />
        <RingSub>Timer starts when you pour</RingSub>
      </ScaleRing>
    );
    title = firstStep?.name || firstStep?.label || 'Bloom';
    body = firstStep?.action || '';
    actions = <PrimaryButton quiet onClick={onStartNow}>Start timer now</PrimaryButton>;
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2, background: C.bg, display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '20px 22px 12px', fontFamily: fonts.body, overflowY: 'auto',
    }}>
      {ring}
      <div style={{ textAlign: 'center', marginTop: 16, width: '100%' }}>
        <h2 style={{ fontFamily: fonts.heading, fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', color: C.text, margin: 0 }}>{title}</h2>
        {body && <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.5, margin: '6px auto 0', maxWidth: 300, fontWeight: 500 }}>{body}</p>}
      </div>
      {stage === 'listening' && <div style={{ width: '100%', marginTop: 16 }}><PourChips targets={targets} current={targets[0]} /></div>}
      {(stage === 'connecting' || stage === 'lost') && <div style={{ width: '100%', marginTop: 16 }}><ScaleHint /></div>}
      <div style={{ marginTop: 'auto', width: '100%', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8, borderRadius: radius.md }}>
        {actions}
      </div>
    </div>
  );
}
