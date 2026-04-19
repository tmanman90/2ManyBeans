import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { C, fonts, radius, shadows } from '../styles/theme';
import { haptic } from '../lib/haptics';

const TOUR_STEPS = [
  {
    id: 'jar-slots', tab: 'rotation', target: 'jar-slots',
    title: 'Your Rotation',
    body: [
      { kind: 'greet' },
      { kind: 'instr', text: 'Tap a slot to open a new bag. You can change the number of jars available in Settings.' },
    ],
  },
  {
    id: 'brew-button', tab: 'rotation', target: 'brew-button',
    title: 'Brew Recipe',
    body: [{ kind: 'instr', text: 'Get a custom brew recipe tailored to your bean for the Fellow Aiden. Long press for a hand brew recipe.' }],
    skipWhenNoActive: true,
  },
  {
    id: 'bean-actions', tab: 'rotation', target: 'bean-actions',
    title: 'Bean Actions',
    body: [{ kind: 'instr', text: 'Tap the Ruphus icon to learn about your coffee, the pencil to edit details, or the snowflake to freeze the freshness clock while you\u2019re away.' }],
    skipWhenNoActive: true,
  },
  {
    id: 'add-bean', tab: 'inventory', target: 'add-bean',
    title: 'Add a Bean',
    body: [{ kind: 'instr', text: 'Snap a photo of your bag or add one manually. Professor Ruphus will have his design team turn it into the perfect product shot.' }],
  },
  {
    id: 'sealed-beans', tab: 'inventory', target: 'sealed-beans',
    title: 'Your Stash',
    body: [{ kind: 'instr', text: 'Sealed bags wait here until you\u2019re ready to open one into your rotation.' }],
  },
  {
    id: 'new-tasting', tab: 'tasting', target: 'new-tasting',
    title: 'Log a Tasting',
    body: [{ kind: 'instr', text: 'Tap to start a guided tasting session. Professor Ruphus will coach you through it step by step.' }],
  },
  {
    id: 'chat-input', tab: 'chat', target: 'chat-input',
    title: 'Ask Ruphus',
    body: [{ kind: 'instr', text: 'Type anything about coffee. Ruphus knows his stuff, from brew theory to bean origins.' }],
  },
];

function buildCutoutPath(vw, vh, rect, pad = 8) {
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const w = Math.min(vw - x, rect.width + pad * 2);
  const h = Math.min(vh - y, rect.height + pad * 2);
  const r = Math.min(18, w / 2, h / 2);
  return {
    path: (
      `M0,0 H${vw} V${vh} H0 Z ` +
      `M${x + r},${y} ` +
      `h${w - 2 * r} ` +
      `a${r},${r} 0 0 1 ${r},${r} ` +
      `v${h - 2 * r} ` +
      `a${r},${r} 0 0 1 -${r},${r} ` +
      `h${-(w - 2 * r)} ` +
      `a${r},${r} 0 0 1 -${r},-${r} ` +
      `v${-(h - 2 * r)} ` +
      `a${r},${r} 0 0 1 ${r},-${r} Z`
    ),
    ring: { x, y, w, h, r },
  };
}

export function TourOverlay({ onComplete, setTab, beans, profile, updateProfile }) {
  const hasActiveBeans = beans.filter(b => b.status === 'ACTIVE').length > 0;
  const steps = TOUR_STEPS.filter(s => !(s.skipWhenNoActive && !hasActiveBeans));

  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const completedRef = useRef(false);
  const gotItRef = useRef(null);
  const observerRef = useRef(null);
  const timeoutRef = useRef(null);
  const resizeObRef = useRef(null);
  const scrollCleanupRef = useRef(null);
  const skipCountRef = useRef(0);
  const tooltipRef = useRef(null);
  const [tooltipH, setTooltipH] = useState(170);

  const step = steps[stepIdx];
  const firstName = profile?.displayName?.trim().split(/\s+/)[0] || '';

  useLayoutEffect(() => {
    if (tooltipRef.current) setTooltipH(tooltipRef.current.offsetHeight);
  });

  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    if (root) root.setAttribute('inert', '');
    return () => {
      document.body.style.overflow = origOverflow;
      if (root) root.removeAttribute('inert');
    };
  }, []);

  useEffect(() => {
    import('../tabs/InventoryTab.jsx').catch(() => {});
    import('../tabs/TastingTab.jsx').catch(() => {});
    import('../tabs/ChatTab.jsx').catch(() => {});
  }, []);

  const finishTour = useCallback((completed) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (completed) haptic.success();
    else haptic.light();
    setTab('rotation');
    onComplete();
    updateProfile?.({ tourCompleted: true }).catch((err) => {
      console.warn('[TourOverlay] Failed to persist tourCompleted', err);
    });
  }, [setTab, onComplete, updateProfile]);

  const advanceStep = useCallback(() => {
    haptic.selection();
    if (stepIdx >= steps.length - 1) {
      finishTour(true);
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setStepIdx(prev => prev + 1);
      setTargetRect(null);
      requestAnimationFrame(() => {
        setTransitioning(false);
        haptic.light();
      });
    }, 150);
  }, [stepIdx, steps.length, finishTour]);

  const handleSkip = useCallback(() => {
    haptic.light();
    finishTour(false);
  }, [finishTour]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleSkip();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') advanceStep();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSkip, advanceStep]);

  const findTarget = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const measure = () => setTargetRect(el.getBoundingClientRect());
      measure();
      requestAnimationFrame(() => requestAnimationFrame(measure));
      setTimeout(measure, 350);
      if (resizeObRef.current) resizeObRef.current.disconnect();
      resizeObRef.current = new ResizeObserver(measure);
      resizeObRef.current.observe(el);
      if (scrollCleanupRef.current) scrollCleanupRef.current();
      let scrollParent = el.parentElement;
      while (scrollParent && scrollParent !== document.body) {
        const ov = getComputedStyle(scrollParent).overflowY;
        if (ov === 'auto' || ov === 'scroll') break;
        scrollParent = scrollParent.parentElement;
      }
      if (scrollParent && scrollParent !== document.body) {
        const onScroll = () => measure();
        scrollParent.addEventListener('scroll', onScroll, { passive: true });
        scrollCleanupRef.current = () => scrollParent.removeEventListener('scroll', onScroll);
      }
      return true;
    }
    return false;
  }, [step]);

  useEffect(() => {
    if (!step) return;
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (resizeObRef.current) { resizeObRef.current.disconnect(); resizeObRef.current = null; }
    if (scrollCleanupRef.current) { scrollCleanupRef.current(); scrollCleanupRef.current = null; }

    setTab(step.tab);

    if (findTarget()) return;

    observerRef.current = new MutationObserver(() => {
      if (findTarget()) {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      }
    });
    observerRef.current.observe(document.body, { childList: true, subtree: true });

    timeoutRef.current = setTimeout(() => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      skipCountRef.current++;
      if (skipCountRef.current >= steps.length) {
        finishTour(false);
      } else if (stepIdx < steps.length - 1) {
        setStepIdx(prev => prev + 1);
      } else {
        finishTour(true);
      }
    }, 2000);

    return () => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (resizeObRef.current) { resizeObRef.current.disconnect(); resizeObRef.current = null; }
      if (scrollCleanupRef.current) { scrollCleanupRef.current(); scrollCleanupRef.current = null; }
    };
  }, [stepIdx, step, findTarget, setTab, steps.length, finishTour]);

  useLayoutEffect(() => {
    if (!transitioning && gotItRef.current) {
      gotItRef.current.focus();
    }
  }, [stepIdx, transitioning, targetRect]);

  if (!step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const TAB_BAR_H = 74;
  const GAP = 14;
  const PAD = 12;
  const CARD_W = Math.min(vw - 32, 308);

  let svgPath, ring;
  if (targetRect) {
    const result = buildCutoutPath(vw, vh, targetRect);
    svgPath = result.path;
    ring = result.ring;
  } else {
    svgPath = `M0,0 H${vw} V${vh} H0 Z`;
    ring = null;
  }

  let tooltipTop, tooltipLeft, arrowDir, arrowX;
  if (!targetRect) {
    tooltipTop = vh * 0.4 - tooltipH / 2;
    tooltipLeft = vw / 2 - CARD_W / 2;
    arrowDir = null;
  } else {
    const tCenterX = targetRect.left + targetRect.width / 2;
    const spaceBelow = (vh - TAB_BAR_H) - (targetRect.bottom + 8) - GAP;
    const spaceAbove = (targetRect.top - 8) - GAP - PAD;

    if (spaceBelow >= tooltipH + PAD) {
      tooltipTop = targetRect.bottom + 8 + GAP;
      arrowDir = 'up';
    } else if (spaceAbove >= tooltipH + PAD) {
      tooltipTop = targetRect.top - 8 - GAP - tooltipH;
      arrowDir = 'down';
    } else {
      tooltipTop = vh - TAB_BAR_H - tooltipH - PAD;
      arrowDir = null;
    }
    tooltipTop = Math.max(PAD, Math.min(vh - TAB_BAR_H - tooltipH - PAD, tooltipTop));
    tooltipLeft = Math.max(PAD, Math.min(vw - PAD - CARD_W, tCenterX - CARD_W / 2));
    arrowX = Math.max(tooltipLeft + 18, Math.min(tooltipLeft + CARD_W - 18, tCenterX));
  }

  const isLastStep = stepIdx === steps.length - 1;

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        opacity: transitioning ? 0 : 1,
        transition: 'opacity 150ms ease-out',
        animation: 'tourFadeIn 0.3s ease-out',
      }}
    >
      {/* SVG scrim with cutout */}
      <svg
        style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none', touchAction: 'none' }}
        width="100%" height="100%"
      >
        <path
          fillRule="evenodd"
          fill="rgba(44,24,16,0.55)"
          d={svgPath}
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {/* Pulse ring around spotlight */}
      {ring && (
        <div
          className="tour-pulse-ring"
          style={{
            position: 'fixed', zIndex: 901, pointerEvents: 'none',
            left: ring.x, top: ring.y, width: ring.w, height: ring.h,
            borderRadius: ring.r,
            animation: 'tourPulse 2.4s ease-in-out infinite',
          }}
        />
      )}

      {/* Focus trap sentinel (start) */}
      <div tabIndex={0} onFocus={() => gotItRef.current?.focus()} style={{ position: 'fixed', opacity: 0, width: 0, height: 0 }} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={{
          position: 'fixed',
          zIndex: 910,
          left: tooltipLeft,
          top: tooltipTop,
          width: CARD_W,
          animation: transitioning ? 'none' : 'tourTooltipIn 220ms ease-out',
        }}
      >
        {/* Diamond arrow */}
        {arrowDir && (
          <div style={{
            position: 'absolute',
            [arrowDir === 'up' ? 'top' : 'bottom']: -8,
            left: (arrowX - tooltipLeft) - 8,
            width: 16, height: 16,
            background: C.cream,
            borderTop: arrowDir === 'up' ? `1px solid ${C.borderLight}` : 'none',
            borderLeft: arrowDir === 'up' ? `1px solid ${C.borderLight}` : 'none',
            borderRight: arrowDir === 'down' ? `1px solid ${C.borderLight}` : 'none',
            borderBottom: arrowDir === 'down' ? `1px solid ${C.borderLight}` : 'none',
            transform: 'rotate(45deg)',
          }} />
        )}

        {/* Card body */}
        <div style={{
          background: C.cream,
          border: `1px solid ${C.borderLight}`,
          borderLeft: `3px solid ${C.accentLight}`,
          borderRadius: 16,
          boxShadow: '0 -4px 24px rgba(92,61,46,0.10), 0 20px 50px rgba(92,61,46,0.22)',
          padding: 16,
          position: 'relative',
        }}>
          {/* Header: avatar + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img
              src="/images/professor-ruphus.webp"
              alt=""
              style={{
                width: 36, height: 36,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${C.borderLight}`,
                flexShrink: 0,
              }}
            />
            <div id="tour-title" style={{
              fontFamily: fonts.heading,
              fontSize: 17,
              color: C.text,
              lineHeight: 1.2,
            }}>
              {step.title}
            </div>
          </div>

          {/* Body */}
          <div id="tour-body" aria-live="polite" style={{ marginBottom: 14 }}>
            {step.body.map((b, i) => (
              b.kind === 'greet' ? (
                <div key={i} style={{
                  fontFamily: fonts.title,
                  fontSize: 19,
                  color: C.text,
                  lineHeight: 1.3,
                  marginBottom: 6,
                }}>
                  Hi {firstName || 'there'}! I'm Professor Ruphus. Let me show you around.
                </div>
              ) : (
                <div key={i} style={{
                  fontFamily: fonts.body,
                  fontSize: 14,
                  color: C.textMuted,
                  lineHeight: 1.5,
                  textWrap: 'pretty',
                }}>
                  {b.text}
                </div>
              )
            ))}
          </div>

          {/* Footer: progress dots + button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {steps.map((_, i) => (
                <div key={i} style={{
                  width: i === stepIdx ? 16 : 5,
                  height: 5,
                  borderRadius: 999,
                  background: i <= stepIdx ? C.accent : C.border,
                  transition: 'width 0.25s, background 0.25s',
                }} />
              ))}
            </div>
            <button
              ref={gotItRef}
              onClick={advanceStep}
              style={{
                background: C.accent,
                color: C.cream,
                border: 'none',
                borderRadius: radius.md,
                padding: '8px 14px',
                minWidth: 80,
                fontFamily: fonts.body,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {isLastStep ? 'Done' : 'Got it'}
            </button>
          </div>
        </div>
      </div>

      {/* Skip tour pill */}
      <button
        onClick={handleSkip}
        style={{
          position: 'fixed',
          bottom: `calc(${TAB_BAR_H + 10}px + env(safe-area-inset-bottom, 0px))`,
          left: 16,
          zIndex: 920,
          background: 'rgba(255,248,240,0.85)',
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          padding: '6px 12px',
          fontFamily: fonts.body,
          fontSize: 12,
          fontWeight: 600,
          color: C.textMuted,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Skip tour
      </button>

      {/* Focus trap sentinel (end) */}
      <div tabIndex={0} onFocus={() => gotItRef.current?.focus()} style={{ position: 'fixed', opacity: 0, width: 0, height: 0 }} />
    </div>
  );

  return createPortal(content, document.body);
}
