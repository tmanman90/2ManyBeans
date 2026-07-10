// R10 First scan (the aha) — CREATIVE_SPEC.md §2 R10, contract law.
//
// Variant (a) — cameraPermission === 'granted': the user scans a REAL bag
// (native @capacitor/camera, mirroring ScanSheet.jsx's capture approach; web
// file-input fallback). Sub-states: idle -> scanning (RuphusThinking loader,
// replaces the CTA button while scanBeanLabel() is in flight) -> result (the
// compact bean card + Ruphus's reaction) OR fallback (any camera/scan
// failure/timeout routes here silently). "Skip for now" is always visible in
// every variant-(a) sub-state and always advances WITHOUT a held bean.
//
// Variant (b) — not granted, or a real scan failed: the same card layout,
// filled with the fixed SAMPLE exemplar (Appendix A5), honestly labeled.
//
// Motion law (CREATIVE_SPEC.md §0): entrances are CSS keyframes only (no
// framer mount animations); framer is reserved for whileTap presses. The
// result/fallback card + NoteBubble stagger in as 5 items, 60ms apart,
// reduce-gated.
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts, type as t, radius, shadows, cardBase, glass } from '../../../styles/theme';
import { m, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, onboardingBg } from './OnboardingPrimitives';
import { SCAN_TIMEOUT_MS } from '../onboardingConstants';
import { scanBeanLabel } from '../../../lib/gemini';
import { compressImage } from '../../../lib/claude';
import { isPhotoPickerCancel } from '../../../lib/photoPicker';
import { palateArchetype, palatePrediction } from '../../../lib/onboardingPalate';
import { haptic } from '../../../lib/haptics';
import { RuphusThinking } from '../../tasting/RuphusThinking';
import { Toast } from '../../Toast';

// Appendix A5 — fixed sample exemplar for the variant-(b) fallback card.
// Contract copy: never edit independently of CREATIVE_SPEC.md.
const SAMPLE_CARD = {
  roaster: 'MOVING COFFEE',
  name: 'Bombe Bensa',
  line: 'Ethiopia · Natural',
  chips: ['Apricot', 'Lemon zest', 'Rainier cherry'],
};
const SAMPLE_NOTE =
  "A natural Ethiopian. Bright fruit, big sweetness. When you scan a real bag, I'll do this for yours.";
const SCAN_ERROR_TOAST = "Couldn't read that one. I'll get the next one on your shelf.";

// RuphusThinking appends its own trailing ellipsis to whatever caption is
// passed (see RuphusThinking.jsx), so these are written WITHOUT one — the
// rendered result matches CREATIVE_SPEC.md's "Reading the label…" etc.
const SCANNING_CAPTIONS = ['Reading the label', 'Finding the roaster', 'Almost got it'];

// ─── Result/sample card — the SAME layout for both variants ───────────────
function ScanResultCard({ sample, roaster, name, line, chips }) {
  return (
    <div style={{
      ...cardBase,
      position: 'relative',
      background: C.cream,
      borderRadius: radius.xl,
      boxShadow: shadows.e2,
      padding: '20px 20px 18px',
      marginTop: 4,
    }}>
      <div
        className="r10-stag"
        style={{
          ...t.eyebrow,
          fontSize: 11,
          letterSpacing: '0.14em',
          color: C.textLight,
          marginBottom: 6,
          paddingRight: sample ? 64 : 0,
          animationDelay: '0ms',
        }}
      >
        {roaster}
      </div>
      {sample && (
        <span style={{
          position: 'absolute', top: 20, right: 20,
          ...t.caption, color: C.textLight, letterSpacing: '0.14em',
        }}>
          SAMPLE
        </span>
      )}
      <div
        className="r10-stag"
        style={{
          fontFamily: fonts.title, fontSize: 24, fontWeight: 600,
          color: C.text, lineHeight: 1.15, marginBottom: 4,
          animationDelay: '60ms',
        }}
      >
        {name}
      </div>
      {line && (
        <div
          className="r10-stag"
          style={{
            ...t.body, fontSize: 14, color: C.textMuted,
            marginBottom: chips.length > 0 ? 12 : 0,
            animationDelay: '120ms',
          }}
        >
          {line}
        </div>
      )}
      {chips.length > 0 && (
        <div className="r10-stag" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, animationDelay: '180ms' }}>
          {chips.map((c) => (
            <span
              key={c}
              style={{
                background: C.accentSoft, border: `1px solid ${C.hairline}`, borderRadius: radius.pill,
                padding: '6px 12px', fontSize: 13, fontWeight: 600, color: C.text, fontFamily: fonts.body,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Local CTA bar — R10 needs a slot that can hold either the primary
// button OR the RuphusThinking loader (mid-scan), which OnboardingCtaBar's
// fixed button-only API can't do. Chrome mirrors OnboardingCtaBar exactly;
// the secondary button is forced to 15px/44pt per CREATIVE_SPEC.md §2 R10
// ("Skip for now" — 15px, C.textMuted, 44pt target). ─────────────────────
function R10CtaBar({ children, secondaryLabel, onSecondary }) {
  return (
    <div style={{
      padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)`,
      background: glass.sheet,
      backdropFilter: glass.blur,
      WebkitBackdropFilter: glass.blur,
      borderTop: `1px solid ${C.hairline}`,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {children}
      {secondaryLabel && (
        <m.button
          onClick={() => { haptic.selection(); onSecondary?.(); }}
          whileTap={{ scale: 0.98 }}
          transition={spring.snappy}
          style={{
            width: '100%',
            minHeight: 44,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: fonts.body,
            background: 'transparent',
            color: C.textMuted,
            border: 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            letterSpacing: '0.01em',
          }}
        >
          {secondaryLabel}
        </m.button>
      )}
    </div>
  );
}

function R10PrimaryButton({ label, onClick, disabled }) {
  return (
    <m.button
      onClick={() => { haptic.selection(); onClick?.(); }}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.975 } : {}}
      transition={spring.snappy}
      style={{
        width: '100%',
        minHeight: 52,
        fontSize: t.bodyL.fontSize,
        fontWeight: 700,
        fontFamily: t.bodyL.fontFamily,
        background: disabled ? C.accentLight : `linear-gradient(135deg, ${C.accent} 0%, #C4793F 100%)`,
        color: '#FFFDFA',
        border: 'none',
        borderRadius: radius.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled ? 'none' : shadows.navActive,
        WebkitTapHighlightColor: 'transparent',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </m.button>
  );
}

export default function R10Demo() {
  const { dispatch, answers } = useOnboarding();
  const canScanCamera = answers?.cameraPermission === 'granted';

  // Sub-state machine: idle -> scanning -> result, OR (idle/scanning) ->
  // fallback on any camera/scan failure or timeout. Variant (b) users start
  // straight in 'fallback' — they never see the scan UI at all.
  const [phase, setPhase] = useState(canScanCamera ? 'idle' : 'fallback');
  const [scanResult, setScanResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const fileRef = useRef(null);
  const canceledRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    canceledRef.current = false;
    return () => { canceledRef.current = true; };
  }, []);

  const archetype = palateArchetype(answers?.palateChart);
  const prediction = palatePrediction(archetype.n);

  // Runs the actual read: scanBeanLabel([photo]) under a hard timeout. A
  // "scan attempt" (Gemini call made) is the only path that can show the
  // soft error toast — camera-level failures/cancels never do.
  const runScan = async (photo) => {
    setPhase('scanning');
    const thisGen = ++genRef.current;
    try {
      const parsed = await Promise.race([
        scanBeanLabel([photo]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('scan_timeout')), SCAN_TIMEOUT_MS)),
      ]);
      if (canceledRef.current || thisGen !== genRef.current) return;

      // scanBeanLabel's return shape (src/lib/gemini.js): roaster, name,
      // origin, variety, process, roastDate, bagSize, bagNotes (tasting
      // notes joined by ' / '), producer, region, altitude, farm,
      // roastLevel, cupScore, brewingRec, sourcedBy, shelfLife, roastedIn,
      // sourceInsights. pendingScanBean is a COMPACT subset only (LOOP_LOG
      // D10) — bagNotes splits into a notes array, capped at 3.
      const notes = (parsed.bagNotes || '')
        .split(' / ')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      const result = {
        name: parsed.name || '',
        roaster: parsed.roaster || '',
        origin: parsed.origin || '',
        process: parsed.process || '',
        roastDate: parsed.roastDate || '',
        variety: parsed.variety || '',
        notes,
      };
      // No usable name means Gemini couldn't identify anything on the bag
      // (rare — scanBeanLabel's own prompt constructs a name whenever
      // possible). Route to the same failure path rather than rendering a
      // card with an invented placeholder title (CREATIVE_SPEC.md §4: no
      // copy of Sonnet's own invention).
      if (!result.name) {
        throw new Error('Scan produced no usable name');
      }
      setScanResult(result);
      setPhase('result');
      haptic.medium();
      // Held bean — same answer-writing mechanism every other screen uses
      // (dispatch -> reducer -> persisted via the OnboardingFlow dispatch
      // wrapper), so it survives a background/resume before the user taps
      // "Keep going". Compact fields only, per LOOP_LOG D10.
      dispatch({
        type: 'ANSWER',
        patch: { pendingScanBean: { ...result, source: 'onboarding_scan' } },
      });
    } catch (err) {
      if (canceledRef.current || thisGen !== genRef.current) return;
      console.error('R10 scan failed:', err);
      setToastMsg(SCAN_ERROR_TOAST);
      setPhase('fallback');
    }
  };

  const takeNativePhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera !== 'granted') {
          if (canceledRef.current) return;
          // Permission was revoked since R08 — no scan was attempted, so no
          // toast; just fall through to the honest sample card.
          setPhase('fallback');
          return;
        }
      }
      const image = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1200,
        height: 1200,
      });
      const mediaType = 'image/jpeg';
      const base64 = image.dataUrl.split(',')[1];
      await runScan({ base64, mediaType });
    } catch (err) {
      if (canceledRef.current) return;
      if (isPhotoPickerCancel(err)) return; // user canceled camera — stay on (a) unchanged
      console.error('R10 camera error:', err);
      setPhase('fallback'); // camera/import failure — no scan attempted, no toast
    }
  };

  const handleScanTap = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await takeNativePhoto();
      } else {
        fileRef.current?.click();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const photo = await compressImage(file);
      await runScan(photo);
    } catch (err) {
      console.error('R10 photo processing error:', err);
      setPhase('fallback'); // couldn't even process the photo — no scan attempted
    }
  };

  const handleSkip = () => {
    // Always advances WITHOUT a held bean, even if a scan already
    // succeeded and pendingScanBean is sitting in answers.
    dispatch({ type: 'ADVANCE', next: 'r11', answersPatch: { pendingScanBean: null } });
  };

  const handleKeepGoing = () => {
    dispatch({ type: 'ADVANCE', next: 'r11' });
  };

  const handleFallbackContinue = () => {
    dispatch({ type: 'ADVANCE', next: 'r11' });
  };

  const headline = phase === 'fallback'
    ? "Here's what I'd say about a bag."
    : "Let's read your first bag.";

  // NoteBubble template (CREATIVE_SPEC.md §2 R10, exact): drop the first
  // sentence entirely when origin/process are missing.
  const noteLine = scanResult && scanResult.origin && scanResult.process
    ? `A ${scanResult.origin} ${scanResult.process}. Right up your alley if you love ${prediction}. I'll keep the full breakdown for your shelf.`
    : `Right up your alley if you love ${prediction}. I'll keep the full breakdown for your shelf.`;

  const resultLine = scanResult
    ? [scanResult.origin, scanResult.process].filter(Boolean).join(' · ')
    : '';

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-first-bean.mp4" height={410} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <div style={{ ...t.display, color: C.text, textAlign: 'center' }}>
          {headline}
        </div>

        {(phase === 'idle' || phase === 'scanning') && (
          <div style={{ ...t.body, fontSize: 15, color: C.textMuted, textAlign: 'center' }}>
            Grab any bag from your shelf. Back label toward me.
          </div>
        )}

        {phase === 'result' && scanResult && (
          <>
            <ScanResultCard
              roaster={scanResult.roaster}
              name={scanResult.name}
              line={resultLine}
              chips={scanResult.notes}
            />
            <div className="r10-stag" style={{ animationDelay: '240ms' }}>
              <NoteBubble>{noteLine}</NoteBubble>
            </div>
          </>
        )}

        {phase === 'fallback' && (
          <>
            <ScanResultCard
              sample
              roaster={SAMPLE_CARD.roaster}
              name={SAMPLE_CARD.name}
              line={SAMPLE_CARD.line}
              chips={SAMPLE_CARD.chips}
            />
            <div className="r10-stag" style={{ animationDelay: '240ms' }}>
              <NoteBubble>{SAMPLE_NOTE}</NoteBubble>
            </div>
          </>
        )}
      </div>

      <input type="file" accept="image/*" ref={fileRef} onChange={handleFileChange} style={{ display: 'none' }} />

      {phase === 'scanning' ? (
        <R10CtaBar secondaryLabel="Skip for now" onSecondary={handleSkip}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 2px' }}>
            <RuphusThinking captions={SCANNING_CAPTIONS} />
          </div>
        </R10CtaBar>
      ) : phase === 'result' ? (
        <R10CtaBar secondaryLabel="Skip for now" onSecondary={handleSkip}>
          <R10PrimaryButton label="Keep going" onClick={handleKeepGoing} />
        </R10CtaBar>
      ) : phase === 'fallback' ? (
        <R10CtaBar>
          <R10PrimaryButton label="Got it" onClick={handleFallbackContinue} />
        </R10CtaBar>
      ) : (
        <R10CtaBar secondaryLabel="Skip for now" onSecondary={handleSkip}>
          <R10PrimaryButton label="Scan my bag" onClick={handleScanTap} disabled={busy} />
        </R10CtaBar>
      )}

      <Toast message={toastMsg} open={!!toastMsg} onClose={() => setToastMsg(null)} variant="error" />

      <style>{`
        .r10-stag { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: no-preference) {
          .r10-stag {
            opacity: 0;
            transform: translateY(10px);
            animation: r10CardIn 240ms cubic-bezier(0.22,1,0.36,1) both;
          }
          @keyframes r10CardIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
