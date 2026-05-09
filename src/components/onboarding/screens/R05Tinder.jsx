import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { useOnboarding } from '../OnboardingContext';
import { TINDER_CARDS, computePalateChart } from '../../../lib/onboardingPalate';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { MascotStage, NoteBubble, OnboardingTopBar, onboardingBg } from './OnboardingPrimitives';

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
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar step="" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-sniffing-beans.mp4" height={240} />

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <NoteBubble>
          Quick round. Swipe right if it sounds like you, left if it doesn't. There's no wrong answer.
        </NoteBubble>

        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8,
          marginTop: 4,
        }}>
          {TINDER_CARDS.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 4,
              background: i <= cardIndex ? C.accent : C.borderLight,
              transition: 'background 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}>
          <SwipeCardDeck
            cardKey={card.id}
            prompt={card.prompt}
            onCommit={commitSwipe}
            flyRef={flyRef}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            onClick={() => handleButtonTap('no')}
            aria-label="Not for me"
            style={{
              flex: 1, minHeight: 50,
              fontSize: 15, fontWeight: 700, fontFamily: fonts.body,
              color: C.textMuted, background: C.card,
              border: `1.5px solid ${C.borderLight}`,
              borderRadius: 12, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Not for me
          </button>
          <button
            onClick={() => handleButtonTap('yes')}
            aria-label="Yes"
            style={{
              flex: 1, minHeight: 50,
              fontSize: 15, fontWeight: 700, fontFamily: fonts.body,
              color: '#fff', background: C.accent,
              border: 'none',
              borderRadius: 12, cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 10px rgba(176,117,64,0.16)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Yes
          </button>
        </div>
      </div>
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
    setTimeout(() => onCommit(direction), 300);
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
      <div
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '100%',
          minHeight: 160,
          background: C.card,
          border: `1.5px solid ${C.borderLight}`,
          borderRadius: 18,
          boxShadow: '0 2px 8px rgba(92,61,46,0.06), 0 12px 28px rgba(92,61,46,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 22px',
          textAlign: 'center',
          cursor: 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'none',
        }}
      >
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 21,
          lineHeight: 1.3,
          color: C.text,
        }}>
          {prompt}
        </div>
      </div>
    </div>
  );
}
