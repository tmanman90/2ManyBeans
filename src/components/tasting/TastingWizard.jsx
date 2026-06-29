// TastingWizard — the intelligent, reactive guided-tasting experience. Replaces the linear chat
// takeover. Professor Ruphus PREDICTS what this specific bean should taste like (predict() over
// origin×process×roast×altitude), walks the full Hoffmann arc one beat per card (custom sliders +
// gated flavor wheel + free text), reacts per step, builds a REAL live radar (signature sweep),
// and ends with a found-vs-expected reveal + a palate-progress surface. Deterministic core works
// with zero AI; an additive Ruphus reaction (claude.js) enhances but never gates. Saves a tasting
// in the EXISTING record shape via the existing addTasting. transform/opacity motion, reduced-
// motion gated, iOS safe-area + keyboard aware.
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { C, fonts, type, radius, shadows, glass, motion as M } from '../../styles/theme';
import { haptic } from '../../lib/haptics';
import { predict } from '../../lib/tastingExpectations';
import { palateLevel } from '../../lib/palate';
import { AXES as SLIDER_AXES } from '../../lib/flavorWheel';
import { TASTING_WIZARD_STEPS, initialAnswers, stepComplete, capturedScores, buildTastingFromAnswers } from '../../lib/tastingWizardSteps';
import { reactToTastingStep } from '../../lib/claude';
import { useNativeKeyboard } from '../../hooks/useNativeKeyboard';
import { AxisSlider } from './AxisSlider';
import { FlavorWheelPicker } from './FlavorWheelPicker';
import { RuphusReaction } from './RuphusReaction';
import { RadarLightSweep } from './RadarLightSweep';
import { StarRating } from '../StarRating';

const AXIS_BY_KEY = Object.fromEntries(SLIDER_AXES.map(a => [a.key, a]));
const INTENSITY_AXIS = { label: 'Intensity', notches: ['silent', 'faint', 'clear', 'strong', 'intense'] };
const BALANCE_AXIS = { label: 'Balance', notches: ['clashing', 'uneven', 'settling', 'harmonious', 'seamless'] };

const POSE_FOR = {
  intro: 'presenting', smell: 'magnifying', firstsip: 'cupping', acidity: 'magnifying',
  sweetness: 'reading', body: 'magnifying', flavor: 'cupping', finish: 'notes', balance: 'presenting', reveal: 'presenting',
};
// Per-step "lens" caption — distinguishes the beats that share the flavor wheel (smell vs flavor)
// so they don't read as the same screen twice. Plain-language, not jargon.
const STEP_LENS = {
  smell: 'before you sip', firstsip: 'first taste', acidity: 'the liveliness', sweetness: 'as it cools',
  body: 'the weight', flavor: 'while you taste', finish: 'after you swallow', balance: 'the whole picture',
};
// Scaffolded quick-picks for the first-sip beat (so non-typers always have a path).
const SIP_PICKS = ['Bright & light', 'Round & smooth', 'Bold & intense', 'Delicate & clean', 'Rich & syrupy'];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function TastingWizard({ bean, beans, tastings = [], onSave, onClose, onSwitchToManual, reduce = false, isPro = true, onCharge }) {
  const [phase, setPhase] = useState('intro'); // intro | steps | reveal
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [aiLine, setAiLine] = useState(null);
  const aiSeq = useRef(0);
  // Keyboard height so the content area can pad out and the focused field scrolls clear of the keyboard.
  const keyboardHeight = useNativeKeyboard({ hideTabBar: false });

  const expected = useMemo(() => predict(bean), [bean]);
  const palate = useMemo(() => palateLevel(tastings), [tastings]);
  const step = TASTING_WIZARD_STEPS[idx];
  const scores = answers.scores;
  const captured = capturedScores(answers);
  const allCaptured = ['fragranceAroma', 'acidity', 'sweetness', 'body', 'flavor', 'balance'].every(k => captured[k] > 0);

  // --- answer mutators ---
  const setScore = useCallback((key, v) => setAnswers(a => ({ ...a, scores: { ...a.scores, [key]: v } })), []);
  const setFinish = useCallback((v) => setAnswers(a => ({ ...a, finishLevel: v })), []);
  const setText = useCallback((k, v) => setAnswers(a => ({ ...a, text: { ...a.text, [k]: v } })), []);
  const toggleChip = useCallback((field, label) => setAnswers(a => {
    const cur = a[field]; const next = cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label];
    return { ...a, [field]: next };
  }), []);

  // --- additive LLM reaction (best-effort; deterministic line shows regardless) ---
  const fireReaction = useCallback(async (stepObj, ans) => {
    if (!isPro || typeof reactToTastingStep !== 'function') return;
    const seq = ++aiSeq.current;
    try {
      const userText = summarizeStepAnswer(stepObj, ans);
      if (!userText) return;
      const line = await reactToTastingStep({ bean, step: stepObj, userText, expected });
      if (line && seq === aiSeq.current) setAiLine(line);
    } catch { /* non-gating */ }
  }, [bean, expected, isPro]);

  const goNext = useCallback(() => {
    haptic.light();
    setAiLine(null);
    if (phase === 'intro') { setPhase('steps'); return; }
    fireReaction(step, answers); // react to what they just entered (non-blocking)
    if (idx < TASTING_WIZARD_STEPS.length - 1) setIdx(i => i + 1);
    else { setPhase('reveal'); haptic.success(); }
  }, [phase, idx, step, answers, fireReaction]);

  const goBack = useCallback(() => {
    haptic.light(); setAiLine(null);
    if (phase === 'steps' && idx === 0) setPhase('intro');
    else if (phase === 'reveal') setPhase('steps');
    else setIdx(i => Math.max(0, i - 1));
  }, [phase, idx]);

  const canAdvance = phase === 'intro' || phase === 'reveal' || stepComplete(step, answers);

  const handleSave = useCallback(() => {
    const record = buildTastingFromAnswers(answers, bean?.id, todayISO());
    haptic.success();
    onSave?.(record);
  }, [answers, bean, onSave]);

  // The overlay is a PLAIN div (opaque, opacity defaults to 1) so it is ALWAYS visible the instant
  // it mounts — never dependent on a JS/framer animation that could fail to fire on WKWebView and
  // leave it stuck invisible. A CSS keyframe (.wiz-overlay-in, in global.css) adds a safe fade that
  // degrades to "instantly visible" if it doesn't run. Inner content still animates via framer.
  return createPortal(
    <div
      className={reduce ? undefined : 'wiz-overlay-in'}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: C.bg,
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <WizardHeader bean={bean} phase={phase} idx={idx} total={TASTING_WIZARD_STEPS.length} onClose={onClose} reduce={reduce} />

      {/* Content is plain-DOM + CSS-fade (keyed per phase/step so the fade re-runs). Visibility is
          NEVER gated on framer's animate — which does not reliably run inside the WKWebView portal,
          leaving opacity:0 content stuck invisible. No AnimatePresence mode="wait" either: it gates
          the next page on an exit animation that may never complete. */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 20px 20px', paddingBottom: 20 + keyboardHeight }}>
        {phase === 'intro' && (
          <Stage key="intro" reduce={reduce}>
            <IntroCard bean={bean} expected={expected} palate={palate} reduce={reduce} />
          </Stage>
        )}
        {phase === 'steps' && (
          <Stage key={`step-${idx}`} reduce={reduce}>
            <StepCard
              step={step} bean={bean} expected={expected} answers={answers} captured={captured}
              allCaptured={allCaptured} palate={palate} aiLine={aiLine} reduce={reduce}
              setScore={setScore} setFinish={setFinish} setText={setText} toggleChip={toggleChip}
            />
          </Stage>
        )}
        {phase === 'reveal' && (
          <Stage key="reveal" reduce={reduce}>
            <RevealCard
              bean={bean} expected={expected} answers={answers} scores={scores} palate={palate}
              reduce={reduce} setAnswers={setAnswers}
            />
          </Stage>
        )}
      </div>

      <WizardFooter
        phase={phase} idx={idx} total={TASTING_WIZARD_STEPS.length} canAdvance={canAdvance}
        onBack={goBack} onNext={goNext} onSave={handleSave} onSwitchToManual={onSwitchToManual} reduce={reduce}
      />
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------- header
function WizardHeader({ bean, phase, idx, total, onClose, reduce }) {
  const pct = phase === 'intro' ? 0 : phase === 'reveal' ? 1 : (idx + 1) / total;
  return (
    <div style={{ padding: '6px 16px 10px', background: glass.chrome, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur, borderBottom: `1px solid ${glass.chromeBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...type.eyebrow, color: C.accent }}>Guided tasting</div>
          <div style={{ fontFamily: fonts.heading, fontSize: 17, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bean?.name || bean?.roaster || 'Your coffee'}</div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: C.textMuted, fontSize: 22, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>✕</button>
      </div>
      {/* progress rail — scaleX set DIRECTLY via style (not framer animate, which doesn't run in
          the WKWebView portal); a CSS transition animates it smoothly when it does work. */}
      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: C.bgDeep, overflow: 'hidden', marginTop: 2 }}>
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', borderRadius: 2,
            transformOrigin: 'left center', transform: `scaleX(${pct})`,
            transition: reduce ? 'none' : 'transform 360ms cubic-bezier(0.22,1,0.36,1)',
            background: `linear-gradient(90deg, ${C.accentLight}, ${C.accent})`,
          }}
        />
      </div>
    </div>
  );
}

// Stage wrapper — a PLAIN div, visible by default (opacity 1). A CSS keyframe (.wiz-stage-in,
// global.css) provides a safe fade/rise that degrades to instantly-visible if it does not run.
// Re-keyed per phase/step so the CSS animation re-triggers on each page. No framer here: framer's
// animate does not reliably run inside the WKWebView portal, which would strand opacity:0 content.
function Stage({ children, reduce }) {
  return (
    <div className={reduce ? undefined : 'wiz-stage-in'} style={{ maxWidth: 460, margin: '0 auto' }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- intro
function IntroCard({ bean, expected, palate, reduce }) {
  return (
    <div>
      <RuphusReaction pose="presenting" reduce={reduce}
        line={`I've studied this one. On each slider I'll mark a ◆ where I expect it to land — try to find it yourself, then we'll compare.`} />
      <div style={{ ...cardStyle, marginTop: 18 }}>
        <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 8 }}>What to expect</div>
        <p style={{ margin: 0, fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: C.text, letterSpacing: '-0.01em' }}>{expected.summary}</p>
        {expected.heroDescriptors.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
            {expected.heroDescriptors.map(h => (
              <span key={h} style={{ background: C.accentSoft, color: C.accentDark, borderRadius: radius.pill, padding: '6px 12px', fontFamily: fonts.body, fontWeight: 700, fontSize: 12.5, textTransform: 'capitalize' }}>{h}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ ...cardStyle, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...type.eyebrow, color: C.textLight }}>Your palate</div>
          <div style={{ fontFamily: fonts.heading, fontSize: 17, fontWeight: 600, color: C.text }}>{palate.title}</div>
        </div>
        <PalateRing palate={palate} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step
function StepCard({ step, bean, expected, answers, captured, allCaptured, palate, aiLine, reduce, setScore, setFinish, setText, toggleChip }) {
  const cue = expected.cues[step.key] || step.prompt;
  const line = aiLine || cue;
  return (
    <div>
      {/* live radar building */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <RadarLightSweep scores={captured} size={184} complete={allCaptured} reduce={reduce} />
      </div>

      <RuphusReaction pose={POSE_FOR[step.key] || 'magnifying'} reduce={reduce} line={line} size={84} />

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ ...type.eyebrow, color: C.accent }}>{step.title}</div>
          {STEP_LENS[step.key] && (
            <span style={{ fontFamily: fonts.body, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', color: C.textLight, textTransform: 'none' }}>· {STEP_LENS[step.key]}</span>
          )}
        </div>
        <p style={{ margin: '0 0 14px', fontFamily: fonts.body, fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: C.textMuted }}>{step.technique}</p>

        <StepInput step={step} bean={bean} expected={expected} answers={answers} palate={palate} reduce={reduce}
          setScore={setScore} setFinish={setFinish} setText={setText} toggleChip={toggleChip} />

        {/* free-text — ALWAYS available */}
        <FreeText step={step} value={answers.text[step.key]} onChange={(v) => setText(step.key, v)} />
      </div>
    </div>
  );
}

function StepInput({ step, expected, answers, palate, reduce, setScore, setFinish, setText, toggleChip }) {
  if (step.kind === 'slider') {
    const axis = AXIS_BY_KEY[step.axisKey];
    const isFinish = step.key === 'finish';
    const value = isFinish ? answers.finishLevel : answers.scores[step.scoreKey];
    const exp = expected.axes[step.axisKey]?.level ?? null;
    return <AxisSlider axis={axis} value={value} expected={exp} reduce={reduce}
      onChange={(v) => (isFinish ? setFinish(v) : setScore(step.scoreKey, v))} />;
  }
  if (step.kind === 'balance') {
    return <AxisSlider axis={BALANCE_AXIS} value={answers.scores.balance} expected={expected.axes.balance?.level ?? null} reduce={reduce} onChange={(v) => setScore('balance', v)} />;
  }
  if (step.kind === 'aroma') {
    return (
      <div>
        <FlavorWheelPicker selected={answers.aromaChips} onToggle={(l) => toggleChip('aromaChips', l)} level={palate.level} reduce={reduce} />
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.hairline}` }}>
          <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 12 }}>{step.intensityLabel}</div>
          <AxisSlider axis={INTENSITY_AXIS} value={answers.scores.fragranceAroma} expected={expected.axes.fragranceAroma?.level ?? null} reduce={reduce} onChange={(v) => setScore('fragranceAroma', v)} />
        </div>
      </div>
    );
  }
  if (step.kind === 'flavor') {
    const smelled = answers.aromaChips;
    return (
      <div>
        {/* reference the smell so this beat is predict-then-confirm, not a repeat of the same wheel */}
        <div style={{ background: C.accentSoft, borderRadius: radius.md, padding: '11px 13px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontFamily: fonts.body, fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: C.accentDark }}>
            {smelled.length > 0
              ? <>You smelled <strong style={{ fontWeight: 800 }}>{smelled.join(', ')}</strong>. Which actually come through now you're tasting — and what's <em>new</em>?</>
              : <>Now that it's on your tongue, which flavors come through? Tap what you taste — add anything new.</>}
          </p>
        </div>
        <FlavorWheelPicker selected={answers.flavorChips} onToggle={(l) => toggleChip('flavorChips', l)} level={palate.level} reduce={reduce} />
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.hairline}` }}>
          <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 12 }}>{step.intensityLabel}</div>
          <AxisSlider axis={INTENSITY_AXIS} value={answers.scores.flavor} expected={expected.axes.flavor?.level ?? null} reduce={reduce} onChange={(v) => setScore('flavor', v)} />
        </div>
      </div>
    );
  }
  if (step.kind === 'sip') {
    const sel = answers.text.firstsip;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SIP_PICKS.map(p => {
          const active = sel === p;
          return (
            <m.button key={p} type="button" whileTap={reduce ? {} : { scale: 0.95 }} transition={M.spring.snappy}
              onClick={() => { haptic.selection(); setText('firstsip', active ? '' : p); }}
              style={{ border: `1px solid ${active ? 'rgba(255,255,255,0.4)' : C.border}`, background: active ? C.accent : C.cream, color: active ? C.cream : C.text, borderRadius: radius.pill, padding: '9px 15px', minHeight: 40, fontFamily: fonts.body, fontWeight: 700, fontSize: 13, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: active ? '0 2px 8px rgba(162,99,47,0.3)' : 'none' }}>
              {p}
            </m.button>
          );
        })}
      </div>
    );
  }
  return null;
}

function FreeText({ step, value, onChange }) {
  const ref = useRef(null);
  // sip uses the text field as its primary input (quick-picks fill it) — skip the duplicate box there
  if (step.kind === 'sip') return null;
  return (
    <div style={{ marginTop: 16 }}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
        placeholder="In your own words… (optional — Professor Ruphus reads this)"
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'none',
          fontFamily: fonts.body, fontSize: 16, fontWeight: 500, lineHeight: 1.45, color: C.text,
          background: C.bgDeep, border: `1px solid ${C.hairline}`, borderRadius: radius.md, padding: '11px 13px',
          WebkitAppearance: 'none', outline: 'none',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- reveal
function RevealCard({ bean, expected, answers, scores, palate, reduce, setAnswers }) {
  const rows = [
    ['acidity', 'Acidity'], ['sweetness', 'Sweetness'], ['body', 'Body'],
  ];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <RadarLightSweep scores={scores} size={236} complete reduce={reduce} />
      </div>
      <RuphusReaction pose="presenting" reduce={reduce} line={revealLine(scores, expected)} />

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 12 }}>You found vs. what I expected</div>
        {rows.map(([key, label]) => (
          <CompareRow key={key} label={label} found={scores[key]} expected={expected.axes[key]?.level} />
        ))}
        {answers.flavorChips.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
            <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 8 }}>Flavors you named</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {answers.flavorChips.map(f => <span key={f} style={{ background: C.accentSoft, color: C.accentDark, borderRadius: radius.pill, padding: '5px 11px', fontFamily: fonts.body, fontWeight: 700, fontSize: 12, textTransform: 'capitalize' }}>{f}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* one-word headline + your-own-words reflection + rating */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ ...type.eyebrow, color: C.textLight, marginBottom: 10 }}>Sum it up</div>
        <input
          value={answers.oneWord}
          onChange={(e) => setAnswers(a => ({ ...a, oneWord: e.target.value }))}
          onFocus={(e) => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
          placeholder="One word for this cup…"
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: fonts.heading, fontSize: 18, fontWeight: 600, color: C.text, background: C.bgDeep, border: `1px solid ${C.hairline}`, borderRadius: radius.md, padding: '11px 13px', WebkitAppearance: 'none', outline: 'none', marginBottom: 12 }}
        />
        {/* your own words — this becomes "Your notes" on the saved cup (not the auto Flavors line) */}
        <textarea
          value={answers.notes}
          onChange={(e) => setAnswers(a => ({ ...a, notes: e.target.value }))}
          onFocus={(e) => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
          placeholder="In your own words — what did you think of this cup? (optional)"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: fonts.body, fontSize: 16, fontWeight: 500, lineHeight: 1.45, color: C.text, background: C.bgDeep, border: `1px solid ${C.hairline}`, borderRadius: radius.md, padding: '11px 13px', WebkitAppearance: 'none', outline: 'none', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...type.eyebrow, color: C.textLight }}>Rating</span>
          <StarRating value={answers.rating} onChange={(r) => setAnswers(a => ({ ...a, rating: r }))} />
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <PalateRing palate={palate} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, color: C.text }}>{palate.title}</div>
          <div style={{ fontFamily: fonts.body, fontSize: 12.5, fontWeight: 600, color: C.textMuted }}>
            {palate.nextAt ? `${palate.toNext} more ${palate.toNext === 1 ? 'cup' : 'cups'} to level up` : 'Top palate level reached'}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, found, expected }) {
  const f = found || 0, e = expected || 0;
  const close = Math.abs(f - e) <= 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <span style={{ width: 78, fontFamily: fonts.body, fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
      <div style={{ flex: 1, position: 'relative', height: 8, borderRadius: 4, background: C.bgDeep, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${f * 10}%`, borderRadius: 4, background: `linear-gradient(90deg, ${C.accentLight}, ${C.accent})` }} />
        <div aria-hidden style={{ position: 'absolute', left: `calc(${e * 10}% - 1px)`, top: -2, bottom: -2, width: 2, background: C.accentDark, opacity: 0.6 }} />
      </div>
      <span style={{ width: 64, textAlign: 'right', fontFamily: fonts.body, fontSize: 11.5, fontWeight: 700, color: close ? C.green : C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        {close ? 'spot on' : f > e ? 'more' : 'less'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- palate ring
function PalateRing({ palate }) {
  const size = 46, r = 19, c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.bgDeep} strokeWidth={3.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.accent} strokeWidth={3.5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - palate.progress)} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.heading, fontSize: 15, fontWeight: 700, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{palate.level}</span>
    </div>
  );
}

// ---------------------------------------------------------------- footer
function WizardFooter({ phase, idx, total, canAdvance, onBack, onNext, onSave, onSwitchToManual, reduce }) {
  const showBack = !(phase === 'intro');
  return (
    <div style={{ padding: '12px 20px calc(12px + env(safe-area-inset-bottom))', background: glass.chrome, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur, borderTop: `1px solid ${glass.chromeBorder}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 460, margin: '0 auto' }}>
        {showBack && (
          <m.button type="button" onClick={onBack} whileTap={reduce ? {} : { scale: 0.96 }} transition={M.spring.snappy}
            style={{ minHeight: 52, padding: '0 18px', borderRadius: radius.md, border: `1px solid ${C.border}`, background: C.cream, color: C.text, fontFamily: fonts.body, fontWeight: 700, fontSize: 15, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Back
          </m.button>
        )}
        {phase === 'reveal' ? (
          <GlassCTA label="Save tasting" onClick={onSave} enabled reduce={reduce} />
        ) : (
          <GlassCTA label={phase === 'intro' ? "Let's taste it" : (idx === total - 1 ? 'See your cup' : 'Next')} onClick={onNext} enabled={canAdvance} reduce={reduce} />
        )}
      </div>
      {phase === 'intro' && onSwitchToManual && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button onClick={onSwitchToManual} style={{ border: 'none', background: 'transparent', color: C.textMuted, fontFamily: fonts.body, fontWeight: 600, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
            or log a tasting manually
          </button>
        </div>
      )}
    </div>
  );
}

// Liquid Glass primary CTA (matches the app's glass button material).
function GlassCTA({ label, onClick, enabled, reduce }) {
  return (
    <m.button
      type="button"
      onClick={enabled ? onClick : undefined}
      whileTap={enabled && !reduce ? { scale: 0.975, filter: 'brightness(1.07)' } : {}}
      transition={M.spring.snappy}
      style={{
        flex: 1, position: 'relative', minHeight: 52, borderRadius: radius.md, border: 'none', overflow: 'hidden',
        cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.5,
        background: `linear-gradient(180deg, ${C.accentLight} -10%, ${C.accent} 55%, ${C.accentDark} 130%)`,
        backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -2px 7px rgba(40,20,8,0.30), 0 1px 2px rgba(70,41,26,0.2), 0 12px 30px rgba(120,70,34,0.36)',
        color: C.cream, fontFamily: fonts.body, fontWeight: 800, fontSize: 16, letterSpacing: '0.01em',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', background: 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0))', pointerEvents: 'none' }} />
      <span style={{ position: 'relative', textShadow: '0 1px 2px rgba(40,20,8,0.3)' }}>{label}</span>
    </m.button>
  );
}

// ---------------------------------------------------------------- helpers
const cardStyle = { background: C.card, borderRadius: radius.lg, border: `1px solid ${C.borderLight}`, boxShadow: shadows.card, padding: 18 };

function summarizeStepAnswer(step, ans) {
  if (step.kind === 'slider') {
    const v = step.key === 'finish' ? ans.finishLevel : ans.scores[step.scoreKey];
    return v != null ? `${step.title}: ${v}/10. ${ans.text[step.key] || ''}`.trim() : '';
  }
  if (step.kind === 'balance') return ans.scores.balance != null ? `Balance: ${ans.scores.balance}/10. ${ans.text.balance || ''}`.trim() : '';
  if (step.kind === 'aroma') return [ans.aromaChips.join(', '), ans.text.smell].filter(Boolean).join('. ');
  if (step.kind === 'flavor') return [ans.flavorChips.join(', '), ans.text.flavor].filter(Boolean).join('. ');
  if (step.kind === 'sip') return ans.text.firstsip || '';
  return '';
}

function revealLine(scores, expected) {
  const pairs = [['acidity', 'acidity'], ['sweetness', 'sweetness'], ['body', 'body']];
  const hits = pairs.filter(([k]) => Math.abs((scores[k] || 0) - (expected.axes[k]?.level || 0)) <= 1).length;
  if (hits >= 3) return `Remarkable — your palate matched what I expected almost exactly. You're getting sharp.`;
  if (hits >= 1) return `Nicely done. You nailed some of it, and where you differ is exactly how palates grow.`;
  return `Beautiful work finishing the whole cup. Tasting is a muscle — every cup makes the next one clearer.`;
}
