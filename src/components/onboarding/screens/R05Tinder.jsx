import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { C, fonts, type, shadows, radius } from '../../../styles/theme';
import { R05_LAST_SWIPE_HOLD_MS } from '../onboardingConstants';
import { haptic } from '../../../lib/haptics';
import { useOnboarding } from '../OnboardingContext';
import { TINDER_CARDS, computePalateChart } from '../../../lib/onboardingPalate';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { m, listContainer, listItem } from '../../../lib/motion';
import { MascotStage, NoteBubble, OnboardingTopBar } from './OnboardingPrimitives';

const SWIPE_COMMIT_THRESHOLD = 40;
const SWIPE_OFFSCREEN = 520;

export default function R05Tinder() {
  const { dispatch, answers } = useOnboarding();
  const alreadyComplete =
    Array.isArray(answers?.tinderCards) &&
    answers.tinderCards.length === 5 &&
    !!answers?.palateChart;

  const [cardIndex, setCardIndex] = useState(0);
  const [swipes, setSwipes] = useState([]);
  const committedRef = useRef(false);
  const flyRef = useRef(null);

  useLayoutEffect(() => {
    if (alreadyComplete) dispatch({ type: 'ADVANCE', next: 'r6' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (alreadyComplete) return null;

  const card = TINDER_CARDS[cardIndex];
  const isLast = cardIndex === TINDER_CARDS.length - 1;

  const commitSwipe = (direction) => {
    if (committedRef.current) return;
    const next = [...swipes, { id: card.id, swipe: direction }];
    setSwipes(next);
    logOnboardingEvent('onboarding_tinder_swipe', { card_id: card.id, direction });
    haptic.selection();

    if (isLast) {
      committedRef.current = true;
      const palateChart = computePalateChart(next);
      dispatch({
        type: 'ADVANCE',
        next: 'r6',
        answersPatch: { tinderCards: next, palateChart },
      });
    } else {
      setCardIndex(cardIndex + 1);
    }
  };

  const handleButtonTap = (direction) => {
    if (flyRef.current) {
      flyRef.current(direction);
    } else {
      commitSwipe(direction);
    }
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-sniffing-beans.mp4" height={210} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Note bubble */}
        <m.div variants={listItem}>
          <NoteBubble>
            Quick round. Swipe right if it sounds like you, left if it doesn't. There's no wrong answer.
          </NoteBubble>
        </m.div>

        {/* Progress dots */}
        <m.div variants={listItem} style={{
          display: 'flex', justifyContent: 'center', gap: 7,
          marginTop: 2,
        }}>
          {TINDER_CARDS.map((_, i) => (
            <div key={i} style={{
              width: i <= cardIndex ? 20 : 8,
              height: 8,
              borderRadius: radius.pill,
              background: i < cardIndex
                ? C.accentLight
                : i === cardIndex
                  ? C.accent
                  : C.borderLight,
              transition: 'background 0.22s ease, width 0.22s ease',
            }} />
          ))}
        </m.div>

        {/* Swipe card */}
        <m.div variants={listItem} style={{ display: 'flex', justifyContent: 'center' }}>
          <SwipeCardDeck
            cardKey={card.id}
            prompt={card.prompt}
            onCommit={commitSwipe}
            flyRef={flyRef}
          />
        </m.div>

        {/* Like / Skip buttons — styled as clear affordances */}
        <m.div variants={listItem} style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {/* Skip / No */}
          <button
            onClick={() => handleButtonTap('no')}
            aria-label="Not for me"
            style={{
              flex: 1, minHeight: 54,
              fontSize: type.bodyL.fontSize,
              fontWeight: 700,
              fontFamily: fonts.body,
              color: C.textMuted,
              background: C.card,
              border: `1.5px solid ${C.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: shadows.e1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 18 }}>✕</span>
            Not for me
          </button>

          {/* Like / Yes */}
          <button
            onClick={() => handleButtonTap('yes')}
            aria-label="Yes"
            style={{
              flex: 1, minHeight: 54,
              fontSize: type.bodyL.fontSize,
              fontWeight: 700,
              fontFamily: fonts.body,
              color: '#fff',
              background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentLight} 100%)`,
              border: 'none',
              borderRadius: radius.md,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: `${shadows.button}, 0 4px 16px rgba(168,106,56,0.28)`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 18 }}>♥</span>
            Yes!
          </button>
        </m.div>
      </m.div>
    </div>
  );
}

function SwipeCardDeck({ cardKey, prompt, onCommit, flyRef }) {
  const cardRef = useRef(null);
  const startXRef = useRef(null);
  const currentDxRef = useRef(0);
  const rafRef = useRef(null);
  const committingRef = useRef(false);

  const commitFly = (direction) => {
    if (committingRef.current) return;
    committingRef.current = true;
    const el = cardRef.current;
    if (el) {
      el.style.transition = 'transform 0.28s ease-out, opacity 0.28s ease-out';
      const target = direction === 'yes' ? SWIPE_OFFSCREEN : -SWIPE_OFFSCREEN;
      el.style.transform = `translateX(${target}px) rotate(${target / 16}deg)`;
      el.style.opacity = '0';
    }
    setTimeout(() => onCommit(direction), R05_LAST_SWIPE_HOLD_MS);
  };

  useEffect(() => {
    flyRef.current = commitFly;
  });

  useEffect(() => {
    startXRef.current = null;
    currentDxRef.current = 0;
    committingRef.current = false;
    const el = cardRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = 'translateX(0px) rotate(0deg) scale(0.92)';
      el.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.3s ease-out, opacity 0.25s ease-out';
          el.style.transform = 'translateX(0px) rotate(0deg) scale(1)';
          el.style.opacity = '1';
        });
      });
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [cardKey]);

  const applyTransform = () => {
    rafRef.current = null;
    const el = cardRef.current;
    if (!el) return;
    const dx = currentDxRef.current;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 16}deg)`;
  };

  const scheduleTransform = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(applyTransform);
  };

  const handlePointerDown = (e) => {
    if (committingRef.current) return;
    startXRef.current = e.clientX;
    currentDxRef.current = 0;
    if (cardRef.current) cardRef.current.style.transition = 'none';
    if (cardRef.current?.setPointerCapture) {
      try { cardRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const handlePointerMove = (e) => {
    if (startXRef.current == null) return;
    currentDxRef.current = e.clientX - startXRef.current;
    scheduleTransform();
  };

  const handlePointerUp = () => {
    if (startXRef.current == null) return;
    const dx = currentDxRef.current;
    startXRef.current = null;
    if (dx > SWIPE_COMMIT_THRESHOLD) {
      commitFly('yes');
    } else if (dx < -SWIPE_COMMIT_THRESHOLD) {
      commitFly('no');
    } else {
      currentDxRef.current = 0;
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.22s ease';
        cardRef.current.style.transform = 'translateX(0px) rotate(0deg)';
      }
    }
  };

  return (
    <div style={{ touchAction: 'pan-y', display: 'flex', justifyContent: 'center', width: '100%' }}>
      {/* Card shadow layer for depth */}
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Stacked card illusion — bottom */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: C.cardMuted,
          borderRadius: radius.xl,
          transform: 'translateY(8px) scale(0.96)',
          border: `1px solid ${C.border}`,
        }} />
        {/* Stacked card illusion — middle */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: C.cream,
          borderRadius: radius.xl,
          transform: 'translateY(4px) scale(0.98)',
          border: `1px solid ${C.borderLight}`,
          boxShadow: shadows.e1,
        }} />

        {/* Active swipe card */}
        <div
          ref={cardRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'relative',
            width: '100%',
            minHeight: 180,
            background: C.card,
            border: `1.5px solid ${C.borderLight}`,
            borderRadius: radius.xl,
            boxShadow: `${shadows.e3}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 28px',
            textAlign: 'center',
            cursor: 'grab',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'none',
          }}
        >
          {/* Decorative top accent line */}
          <div style={{
            position: 'absolute',
            top: 0, left: '20%', right: '20%',
            height: 3,
            background: `linear-gradient(90deg, transparent, ${C.accentLight}, transparent)`,
            borderRadius: '0 0 3px 3px',
          }} />

          {/* Prompt text */}
          <div style={{
            fontFamily: fonts.heading,
            fontSize: type.h2.fontSize,
            fontWeight: type.h2.fontWeight,
            lineHeight: 1.35,
            color: C.text,
          }}>
            {prompt}
          </div>

          {/* Swipe hint labels */}
          <div style={{
            position: 'absolute',
            bottom: 16, left: 20, right: 20,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{
              ...type.caption,
              color: C.textLight,
              opacity: 0.7,
            }}>← skip</span>
            <span style={{
              ...type.caption,
              color: C.textLight,
              opacity: 0.7,
            }}>like →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
