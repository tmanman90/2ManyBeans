// Brew summary with a scale (mockup 06): water vs target, real ratio, bloom,
// flow, the pour curve against the targets and the last brew of this bean,
// and each pour's target vs poured vs time reached.

import { useEffect } from 'react';
import { C, fonts, radius, shadows, glass } from '../../styles/theme';
import { haptic } from '../../lib/haptics';
import { formatMMSS } from '../../hooks/useBrewTimer';

const W = 320;
const H = 150;
const PAD = { left: 30, right: 8, top: 8, bottom: 20 };

function PourChart({ summary, lastCurve }) {
  const curve = summary.curve;
  const seconds = Math.max(60, curve.length - 1, lastCurve ? lastCurve.length - 1 : 0);
  const topG = Math.max(...curve, ...summary.perStep.map((step) => step.targetG || 0), ...(lastCurve || [0]));
  const maxG = Math.ceil((topG * 1.08) / 50) * 50 || 50;
  const x = (second) => PAD.left + (second / seconds) * (W - PAD.left - PAD.right);
  const y = (grams) => H - PAD.bottom - (grams / maxG) * (H - PAD.top - PAD.bottom);
  const line = (values) => values.map((grams, second) => `${second ? 'L' : 'M'}${x(second).toFixed(1)},${y(grams).toFixed(1)}`).join(' ');
  // Targets as steps: each target applies from the second its pour was due.
  const targetPath = summary.perStep.reduce((path, step, index) => {
    if (!Number.isFinite(step.targetG)) return path;
    const from = step.dueSec ?? 0;
    const prev = index === 0 ? 0 : summary.perStep[index - 1].targetG;
    return `${path} L${x(from).toFixed(1)},${y(prev).toFixed(1)} L${x(from).toFixed(1)},${y(step.targetG).toFixed(1)}`;
  }, `M${x(0)},${y(0)}`) + ` L${x(seconds)},${y(summary.perStep.at(-1)?.targetG || 0)}`;
  const flows = curve.map((grams, second) => (second ? Math.max(0, grams - curve[second - 1]) : 0));
  const maxFlow = Math.max(8, ...flows);
  const gridG = [0, maxG / 3, (2 * maxG) / 3].map((value) => Math.round(value / 50) * 50);
  const tickEvery = seconds > 240 ? 120 : 60;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pour curve">
      {gridG.map((grams) => (
        <g key={grams}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(grams)} y2={y(grams)} stroke={C.hairline} />
          <text x={PAD.left - 5} y={y(grams) + 3} textAnchor="end" fontSize="8" fill={C.textLight} fontFamily={fonts.body}>{grams}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(seconds / tickEvery) + 1 }, (_, index) => index * tickEvery).map((second) => (
        <text key={second} x={x(second)} y={H - 6} textAnchor="middle" fontSize="8" fill={C.textLight} fontFamily={fonts.body}>{formatMMSS(second * 1000)}</text>
      ))}
      {flows.map((gps, second) => gps > 0.3 && (
        <rect key={second} x={x(second) - 1} width={2} y={H - PAD.bottom - (gps / maxFlow) * 40} height={(gps / maxFlow) * 40} fill={C.green} opacity={0.35} />
      ))}
      <path d={targetPath} fill="none" stroke={C.textLight} strokeWidth="1.2" strokeDasharray="3 3" />
      {lastCurve && <path d={line(lastCurve)} fill="none" stroke={C.textMuted} strokeWidth="1.2" strokeDasharray="1.5 2.5" />}
      <path d={line(curve)} fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ value, label, detail, detailColor = C.green }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '9px 4px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: fonts.heading, fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: C.text }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight, marginTop: 2 }}>{label}</div>
      {detail && <div style={{ fontSize: 11, fontWeight: 700, color: detailColor, marginTop: 1 }}>{detail}</div>}
    </div>
  );
}

export function ScaleSummary({ summary, lastCurve, totalElapsedMs, bean, device, doseGrams, saveState, onRetrySave, onStartTasting, onDone }) {
  useEffect(() => {
    haptic.success().catch(() => {});
  }, []);
  const finalTarget = summary.perStep.at(-1)?.targetG;
  const waterDelta = Number.isFinite(finalTarget) ? Math.round(summary.finalWaterG - finalTarget) : null;
  const deviceLabel = { v60: 'V60', kalita: 'Kalita', chemex: 'Chemex', aeropress: 'AeroPress' }[device] || '';
  const bloomPour = summary.perStep[0]?.reachedAtSec;
  const eyebrow = saveState === 'saved' ? 'Brew saved' : saveState === 'saving' ? 'Saving brew' : saveState === 'failed' ? 'Not saved' : 'Brew complete';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2, background: C.bg, overflowY: 'auto', fontFamily: fonts.body,
      padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: saveState === 'failed' ? C.red : C.green, textAlign: 'center', marginTop: 6 }}>{eyebrow}</div>
      <h1 style={{ fontFamily: fonts.heading, fontSize: 30, fontWeight: 600, textAlign: 'center', letterSpacing: '-0.02em', margin: '4px 0 0', color: C.text }}>{formatMMSS(totalElapsedMs)} brew</h1>
      <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, fontWeight: 600, marginTop: 2 }}>
        {[bean?.name, deviceLabel].filter(Boolean).join(' · ')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 14 }}>
        <Stat
          value={`${Math.round(summary.finalWaterG)} g`}
          label="Water"
          detail={waterDelta == null ? null : `${waterDelta >= 0 ? '+' : ''}${waterDelta} g`}
          detailColor={waterDelta != null && Math.abs(waterDelta) > 5 ? C.amber : C.green}
        />
        <Stat value={summary.ratio ? `1:${summary.ratio}` : '--'} label="Ratio" detail={Number.isFinite(doseGrams) ? `${doseGrams} g dose` : null} detailColor={C.textMuted} />
        <Stat value={Number.isFinite(summary.bloomSec) ? formatMMSS(summary.bloomSec * 1000) : '--'} label="Bloom" detail={Number.isFinite(bloomPour) ? `pour ${formatMMSS(bloomPour * 1000)}` : null} detailColor={C.textMuted} />
        <Stat value={summary.peakFlowGps.toFixed(1)} label="Peak g/s" detail={`avg ${summary.avgFlowGps.toFixed(1)}`} detailColor={C.textMuted} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: '12px 12px 8px', marginTop: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 4 }}>
          <span><i style={{ display: 'inline-block', width: 14, borderTop: `2.5px solid ${C.accent}`, verticalAlign: 'middle', marginRight: 4 }} />Poured</span>
          <span><i style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${C.textLight}`, verticalAlign: 'middle', marginRight: 4 }} />Targets</span>
          <span><i style={{ display: 'inline-block', width: 14, borderTop: `6px solid ${C.greenBg}`, verticalAlign: 'middle', marginRight: 4 }} />Flow</span>
          {lastCurve && <span style={{ marginLeft: 'auto' }}>vs last brew · dotted</span>}
        </div>
        <PourChart summary={summary} lastCurve={lastCurve} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: C.text }}>
        <thead>
          <tr>
            {['Pour', 'Target', 'Poured', 'Reached'].map((head, index) => (
              <th key={head} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight, textAlign: index ? 'right' : 'left', padding: '0 4px 4px' }}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.perStep.map((step, index) => {
            const measured = Number.isFinite(step.actualG);
            const off = measured && Math.abs(step.actualG - (step.targetG ?? 0)) > 5;
            const cell = { padding: '6px 4px', borderTop: `1px solid ${C.hairline}`, textAlign: 'right', fontWeight: 700 };
            return (
              <tr key={index}>
                <td style={{ ...cell, textAlign: 'left' }}>{index === 0 ? 'Bloom' : `Pour ${index + 1}`}</td>
                <td style={cell}>{step.targetG}</td>
                <td style={{ ...cell, color: !measured ? C.textLight : off ? C.amber : C.green }}>{measured ? Math.round(step.actualG) : '--'}</td>
                <td style={cell}>{Number.isFinite(step.reachedAtSec) ? formatMMSS(step.reachedAtSec * 1000) : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {saveState === 'failed' && (
        <button type="button" onClick={onRetrySave} style={{ alignSelf: 'center', minHeight: 44, marginTop: 12, padding: '9px 14px', borderRadius: radius.pill, border: `1px solid ${C.red}55`, background: C.redBg, color: C.red, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
      )}
      {saveState === 'ephemeral' && <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textAlign: 'center', marginTop: 10 }}>Not saved for this quick recipe</div>}

      <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {onStartTasting && (
          <button type="button" onClick={onStartTasting} style={{ width: '100%', minHeight: 54, borderRadius: radius.md, background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, fontFamily: fonts.body, cursor: 'pointer', boxShadow: shadows.navActive }}>
            Start Tasting Session
          </button>
        )}
        <button type="button" onClick={onDone} style={{ width: '100%', minHeight: 48, borderRadius: radius.md, background: glass.sheet, color: C.textMuted, border: `1px solid ${C.border}`, fontSize: 15, fontWeight: 600, fontFamily: fonts.body, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  );
}
