import { useEffect, useState } from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { C, fonts, type, radius, shadows, motion as motionTokens, glass } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { assetUrl } from '../../../lib/assetUrl';
import { useOnboarding } from '../OnboardingContext';
import { m, spring, listContainer, listItem } from '../../../lib/motion';
import { CHAPTERS, ALL_STEPS } from '../onboardingConstants';

// ─── Warm paper background value (used by screens as inline background) ───────
// Subtle layered warm gradient — deep paper base with a soft vignette lift so
// cream cards gain real perceived elevation against the background.
export const onboardingBg = `linear-gradient(160deg, ${C.bgDeep} 0%, ${C.bg} 45%, #EDE4D8 100%)`;

// ─── MascotStage ──────────────────────────────────────────────────────────────
// Framing-only refinement: warm radial glow behind the mascot for depth,
// tighter bottom fade. Video pattern is UNCHANGED.
//
// Poster + reduced-motion: every mapped video has a same-folder
// `<name>-poster.jpg` (ffmpeg-extracted first non-black frame, see
// CREATIVE_SPEC.md §3). We derive it from `src` unless an explicit `poster`
// override is passed. Under prefers-reduced-motion the <video> never mounts
// (so it never autoplays) — we render the poster as a plain <img> instead,
// same container/mask/dimensions.
// Mask lives on the CONTAINER, not the media element: WKWebView on real
// devices drops CSS masks on composited (positioned) <video> layers — the
// mask silently disappears and the video's white background renders as a
// hard box (Tal's device review, 2026-07-09). Masking the parent div is the
// established mascot pattern and survives compositing.
// Portrait-card presentation: after two rounds of CSS masks silently failing
// on composited <video> in real-device WKWebView (white-box regression), the
// video's white background is now EMBRACED as a framed portrait: a small
// centered card whose background is the videos' own backdrop color
// (#FEFFFD, sampled from the poster frames), hairline border, soft shadow.
// Zero compositing tricks = identical rendering on sim and device.
const MASCOT_CARD_BG = '#FEFFFD'; // sampled from the mascot renders, not a palette color

const stageMediaStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

export function MascotStage({ src, height = 460, poster }) {
  const reduce = useReducedMotion();
  const posterPath = poster || (src ? src.replace('.mp4', '-poster.jpg') : null);
  const posterSrc = posterPath ? assetUrl(posterPath) : undefined;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      // Clamp: the mascot is an accent, never a hero that starves the copy
      // (device review 2026-07-09: video ate 3/4 of the page).
      height: `min(${height}px, 22dvh)`,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '6px 0 2px',
    }}>
      {/* Warm ambient glow behind the portrait */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 55% 70% at 50% 50%, ${C.accentSoft} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative',
        height: '100%',
        aspectRatio: '3 / 4',
        background: MASCOT_CARD_BG,
        borderRadius: 18,
        border: `1px solid ${C.hairline}`,
        boxShadow: shadows.e2,
        overflow: 'hidden',
      }}>
        {reduce ? (
          <img src={posterSrc} alt="" style={stageMediaStyle} />
        ) : (
          <video
            src={assetUrl(src)}
            poster={posterSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            style={stageMediaStyle}
          />
        )}
      </div>
    </div>
  );
}

// ─── NoteBubble ───────────────────────────────────────────────────────────────
// Premium speech bubble: soft cream surface, hairline border, warm elevation.
// No script font — uses bodyL (Nunito 16/500) for readability.
export function NoteBubble({ children, style = {} }) {
  return (
    <div style={{
      position: 'relative',
      background: C.cream,
      border: `1px solid ${C.hairline}`,
      borderRadius: radius.lg,
      padding: '14px 18px',
      fontFamily: type.bodyL.fontFamily,
      fontSize: type.bodyL.fontSize,
      fontWeight: type.bodyL.fontWeight,
      lineHeight: type.bodyL.lineHeight,
      color: C.text,
      boxShadow: shadows.e2,
      ...style,
    }}>
      {/* Speech bubble tail (top-left) */}
      <div style={{
        position: 'absolute',
        top: -7,
        left: 24,
        width: 14,
        height: 14,
        background: C.cream,
        borderTop: `1px solid ${C.hairline}`,
        borderLeft: `1px solid ${C.hairline}`,
        transform: 'rotate(45deg)',
        borderRadius: 2,
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─── OnboardingTopBar ─────────────────────────────────────────────────────────
// Three-chapter progress system (CREATIVE_SPEC.md §1): [You] [Your taste]
// [Your plan], one pill segment per chapter, each filling left-to-right
// within its own chapter as the user advances. The current chapter's label
// renders as an eyebrow 10px right of the back button, cross-fading on
// chapter change. Reads the step directly off the state machine — no more
// per-screen `step` label prop.
function chapterProgress(stepKey) {
  const chapterIndex = CHAPTERS.findIndex((ch) => ch.steps.includes(stepKey));
  const safeChapterIndex = chapterIndex === -1 ? 0 : chapterIndex;
  const chapter = CHAPTERS[safeChapterIndex];
  const posInChapter = Math.max(0, chapter.steps.indexOf(stepKey));

  // Endowed start: R01 always renders segment 1 at 15%, regardless of the
  // 1-of-4 fraction that would otherwise compute to 25%.
  const currentFraction = stepKey === 'r1'
    ? 0.15
    : (posInChapter + 1) / chapter.steps.length;

  const fractions = CHAPTERS.map((_, i) => {
    if (i < safeChapterIndex) return 1;
    if (i > safeChapterIndex) return 0;
    return currentFraction;
  });

  const stepIndex = Math.max(0, ALL_STEPS.indexOf(stepKey));

  return { chapterIndex: safeChapterIndex, label: chapter.label, fractions, stepIndex };
}

export function OnboardingTopBar({ onBack, hideBack, overlay = false }) {
  const { dispatch, state } = useOnboarding();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    haptic.selection();
    dispatch({ type: 'BACK' });
  };

  const stepKey = state?.step || 'r1';
  const { chapterIndex, label, fractions, stepIndex } = chapterProgress(stepKey);

  // True 160ms cross-fade on chapter change: the outgoing label stays mounted
  // (absolutely stacked) fading out while the incoming one fades in.
  const [prevLabel, setPrevLabel] = useState(null);
  const [shownLabel, setShownLabel] = useState(label);
  useEffect(() => {
    if (label === shownLabel) return;
    setPrevLabel(shownLabel);
    setShownLabel(label);
    const t = setTimeout(() => setPrevLabel(null), 160);
    return () => clearTimeout(t);
  }, [label, shownLabel]);

  return (
    // Always a real layout row — never absolute. Overlay mode used to float
    // the bar over the mascot video, slicing the mascot's face with the
    // chapter progress line on device (Tal's review, 2026-07-09). `overlay`
    // now only picks the glassier back-button chrome.
    <div style={{
      position: 'relative',
      top: 0, left: 0, right: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: `calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px`,
      zIndex: 10,
    }}>
      {/* Row 1 — back button + current chapter label (10px to its right) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
        {!hideBack ? (
          <button
            onClick={handleBack}
            aria-label="Back"
            style={{
              width: 44, height: 44,
              borderRadius: radius.pill,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: overlay ? glass.chrome : `${C.cream}CC`,
              backdropFilter: overlay ? glass.blur : 'none',
              WebkitBackdropFilter: overlay ? glass.blur : 'none',
              border: `1px solid ${C.hairline}`,
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: shadows.e1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ChevronLeft size={20} color={C.textMuted} strokeWidth={2.5} />
          </button>
        ) : (
          <div style={{ width: 44, height: 44, flexShrink: 0 }} />
        )}

        {/* Current chapter label — eyebrow, true 160ms cross-fade on change */}
        <div style={{ position: 'relative' }}>
          <div
            key={shownLabel}
            className="onb-chapter-label"
            style={{
              fontFamily: fonts.body,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.textMuted,
              opacity: 1,
            }}
          >
            {shownLabel}
          </div>
          {prevLabel && (
            <div
              aria-hidden
              className="onb-chapter-label-out"
              style={{
                position: 'absolute', top: 0, left: 0,
                fontFamily: fonts.body,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: C.textMuted,
                pointerEvents: 'none',
              }}
            >
              {prevLabel}
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — 3-segment chapter bar */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ALL_STEPS.length - 1}
        aria-valuenow={stepIndex}
        aria-label="Setup progress"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 3,
        }}
      >
        {fractions.map((fraction, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: radius.pill,
              background: C.border,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              inset: 0,
              background: C.accent,
              borderRadius: radius.pill,
              transformOrigin: 'left center',
              transform: `scaleX(${fraction})`,
              transition: 'transform 200ms ease-out',
            }} />
          </div>
        ))}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes onb-chapter-fade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes onb-chapter-fade-out {
            from { opacity: 1; }
            to   { opacity: 0; }
          }
        }
        .onb-chapter-label { animation: onb-chapter-fade 160ms ease-out; }
        .onb-chapter-label-out { animation: onb-chapter-fade-out 160ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .onb-chapter-label-out { display: none; }
        }
      `}</style>
    </div>
  );
}

// ─── OnboardingCtaBar ─────────────────────────────────────────────────────────
// Confident primary CTA (caramel gradient + warm shadow), refined secondary.
// Glass backdrop for a premium floating feel when sitting over scrolled content.
export function OnboardingCtaBar({ label, onClick, disabled, secondary }) {
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
      <m.button
        onClick={() => { haptic.selection(); onClick?.(); }}
        disabled={disabled}
        whileTap={!disabled ? { scale: 0.975 } : {}}
        transition={spring.snappy}
        style={{
          width: '100%',
          minHeight: 52,
          fontSize: type.bodyL.fontSize,
          fontWeight: 700,
          fontFamily: type.bodyL.fontFamily,
          background: disabled
            ? C.accentLight
            : `linear-gradient(135deg, ${C.accent} 0%, #C4793F 100%)`,
          color: '#FFFDFA',
          border: 'none',
          borderRadius: radius.md,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          boxShadow: disabled ? 'none' : shadows.navActive,
          transition: `opacity ${motionTokens.dur.fast}s, background ${motionTokens.dur.fast}s`,
          WebkitTapHighlightColor: 'transparent',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </m.button>
      {secondary && (
        <m.button
          onClick={() => { haptic.selection(); secondary.onClick?.(); }}
          whileTap={{ scale: 0.98 }}
          transition={spring.snappy}
          style={{
            width: '100%',
            minHeight: 44,
            fontSize: 14,
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
          {secondary.label}
        </m.button>
      )}
    </div>
  );
}

// ─── OnboardingOptionList ─────────────────────────────────────────────────────
// Premium selectable cards: accentSoft fill + accent border when selected,
// hairline + cream otherwise. Spring press. Staggered entrance. Checkmark badge.
export function OnboardingOptionList({ options, value, onSelect, compact = false }) {
  return (
    <m.div
      variants={listContainer}
      initial="initial"
      animate="animate"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <m.button
            key={opt.key}
            variants={listItem}
            onClick={() => { haptic.selection(); onSelect(opt.key); }}
            whileTap={{ scale: 0.978 }}
            transition={spring.snappy}
            style={{
              width: '100%',
              minHeight: compact ? 52 : 58,
              padding: compact ? '12px 16px' : '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: type.bodyL.fontSize,
              fontFamily: type.bodyL.fontFamily,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.accentSoft : C.cream,
              border: `1.5px solid ${selected ? C.accent : C.hairline}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              boxShadow: selected ? shadows.e2 : shadows.e1,
              transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}, border-color ${motionTokens.dur.fast}s ${motionTokens.cssOut}, box-shadow ${motionTokens.dur.fast}s`,
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
            }}
          >
            {Icon && (
              <span style={{
                width: 38, height: 38, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.sm,
                background: selected ? C.accent : C.accentSoft,
                color: selected ? C.cream : C.accent,
                border: selected ? 'none' : `1px solid ${C.border}`,
                transition: `background ${motionTokens.dur.fast}s, color ${motionTokens.dur.fast}s`,
              }}>
                <Icon size={20} strokeWidth={2} />
              </span>
            )}
            <span style={{ flex: 1 }}>{opt.label}</span>
            {/* Checkmark badge on selected */}
            {selected && (
              <span style={{
                width: 22, height: 22, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.pill,
                background: C.accent,
              }}>
                <Check size={13} color={C.cream} strokeWidth={2.5} />
              </span>
            )}
          </m.button>
        );
      })}
    </m.div>
  );
}
