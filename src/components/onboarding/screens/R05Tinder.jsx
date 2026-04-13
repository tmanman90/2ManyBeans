import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { C, fonts, radius, shadows } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';
import { TINDER_CARDS, computePalateChart } from '../../../lib/onboardingPalate';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';

// R5 — five palate cards. Each card is swipeable left/right OR tappable
// via "Yes" / "Not for me" buttons below (motor accessibility).
//
// Atomicity rules (from the plan):
// - All accumulation happens in local state; we never commit partial
//   results to the reducer.
// - On the 5th swipe, we compute the palate chart and dispatch ONE
//   ADVANCE with both { tinderCards, palateChart } in the answersPatch.
//   Never two dispatches — otherwise saveState could snapshot a half
//   state and cross-screen resume becomes inconsistent.
// - On mount, if `answers.tinderCards.length === 5` we immediately
//   advance (handles cold resume into a completed R5). If partial
//   (<5), we reset local state to card 0 and start over.
//
// Gesture rules:
// - Plain pointerdown/pointermove/pointerup — no framer-motion.
// - `transform` is applied via a ref and rAF-throttled. The commit
//   threshold is 80px; anything past that snaps off-screen and counts.
// - `touch-action: pan-y` on the deck container so vertical scroll
//   still works naturally. We only hijack horizontal gestures.

const SWIPE_COMMIT_THRESHOLD = 80; // px — past this, release = commit
const SWIPE_OFFSCREEN = 520; // px — flyoff distance on commit

export default function R05Tinder() {
  const { dispatch, answers } = useOnboarding();
  const alreadyComplete =
    Array.isArray(answers?.tinderCards) && answers.tinderCards.length === 5;

  const [cardIndex, setCardIndex] = useState(0);
  const [swipes, setSwipes] = useState([]);
  const committedRef = useRef(false); // guards against double-commit on final card

  // If we land here with a completed 5-card state (hydrated from
  // localStorage), render NOTHING and advance synchronously in a layout
  // effect. useLayoutEffect fires after DOM mutations but before the
  // browser paints, so the user never sees the first card flash.
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
    logOnboardingEvent('onboarding_tinder_swipe', {
      card_id: card.id,
      direction,
    });
    haptic.selection();

    if (isLast) {
      committedRef.current = true;
      // Single atomic transition: both tinderCards AND palateChart in
      // the same dispatch. This is the only place the reducer learns
      // about the palate result.
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

  return (
    <OnboardingScreenShell
      title="Quick palate round"
      subtitle={`Card ${cardIndex + 1} of ${TINDER_CARDS.length}`}
      ruphusLine="Quick round. Swipe right if it sounds like you, left if it doesn't. There's no wrong answer."
    >
      <SwipeCardDeck
        cardKey={card.id}
        prompt={card.prompt}
        onCommit={commitSwipe}
      />

      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 20,
      }}>
        <button
          onClick={() => commitSwipe('no')}
          aria-label="Not for me"
          style={{
            flex: 1,
            minHeight: 52,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            color: C.textMuted,
            background: C.card,
            border: `1.5px solid ${C.borderLight}`,
            borderRadius: radius.md,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Not for me
        </button>
        <button
          onClick={() => commitSwipe('yes')}
          aria-label="Yes"
          style={{
            flex: 1,
            minHeight: 52,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            color: '#fff',
            background: C.accent,
            border: 'none',
            borderRadius: radius.md,
            cursor: 'pointer',
            boxShadow: shadows.button,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Yes
        </button>
      </div>
    </OnboardingScreenShell>
  );
}

function SwipeCardDeck({ cardKey, prompt, onCommit }) {
  const cardRef = useRef(null);
  const startXRef = useRef(null);
  const currentDxRef = useRef(0);
  const rafRef = useRef(null);
  const committingRef = useRef(false);

  // Reset transform + state whenever a new card mounts — we identify the
  // card via `cardKey` (the card id) so React's key prop + this effect
  // together guarantee a clean slate per card.
  useEffect(() => {
    startXRef.current = null;
    currentDxRef.current = 0;
    committingRef.current = false;
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 0.2s ease';
      cardRef.current.style.transform = 'translateX(0px) rotate(0deg)';
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cardKey]);

  const applyTransform = () => {
    rafRef.current = null;
    const el = cardRef.current;
    if (!el) return;
    const dx = currentDxRef.current;
    const rot = dx / 20; // degrees — mild tilt follows the swipe
    el.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
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

  const commitFly = (direction) => {
    committingRef.current = true;
    const el = cardRef.current;
    if (el) {
      el.style.transition = 'transform 0.22s ease';
      const target = direction === 'yes' ? SWIPE_OFFSCREEN : -SWIPE_OFFSCREEN;
      el.style.transform = `translateX(${target}px) rotate(${target / 20}deg)`;
    }
    // Wait for the fly-off transition to start before committing to the
    // parent. Using a short timeout avoids flashing the next card over
    // the old one — the new card's `key` remount will reset the deck.
    setTimeout(() => onCommit(direction), 180);
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
      // Release under threshold — snap back to center.
      currentDxRef.current = 0;
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.22s ease';
        cardRef.current.style.transform = 'translateX(0px) rotate(0deg)';
      }
    }
  };

  return (
    <div style={{
      // pan-y so vertical scroll is unaffected — we only hijack X.
      touchAction: 'pan-y',
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0',
      minHeight: 260,
    }}>
      <div
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '100%',
          maxWidth: 320,
          minHeight: 240,
          background: C.card,
          border: `1.5px solid ${C.borderLight}`,
          borderRadius: 20,
          boxShadow: shadows.card,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 26px',
          textAlign: 'center',
          cursor: 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'pan-y',
        }}
      >
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          lineHeight: 1.3,
          color: C.text,
        }}>
          {prompt}
        </div>
      </div>
    </div>
  );
}
