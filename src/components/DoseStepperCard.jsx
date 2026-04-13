// Interactive variant of ParamCard for the COFFEE dose.
// `– {dose}g +` with pointer-events-based hold-to-repeat.
//
// Visual layout mirrors ParamCard (background, border-radius, padding,
// textAlign, label typography) so the three cards in the param grid stay
// visually aligned. Icon → uppercase LABEL → interactive row with the dose
// value flanked by minus/plus buttons.
//
// iOS suppression: every stepper button gets the full WebKit callout kill
// combo inline. Global `-webkit-touch-callout: none` is also set in
// src/styles/global.css as belt-and-suspenders, but we duplicate it on the
// button for clarity and to defeat any inherited overrides. The –/+ glyph
// is wrapped in an aria-hidden span with pointer-events: none so the
// button element itself is the touch target (avoids the iOS 17.4+ loupe).

import { useCallback } from 'react';
import { Coffee, Minus, Plus } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { haptic } from '../lib/haptics';
import { useRepeatPress } from '../hooks/useRepeatPress';

const STEPPER_BTN_STYLE = {
  width: 44,
  height: 44,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: C.accent,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  // iOS WebKit callout / selection / loupe suppression
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  WebkitUserDrag: 'none',
  touchAction: 'manipulation',
};

// pointerEvents: none is the load-bearing part (prevents iOS 17.4+ loupe on
// the inner text node). Everything else can be skipped on a single-icon span.
const STEPPER_GLYPH_STYLE = { pointerEvents: 'none' };

export const DoseStepperCard = ({ dose, onChange, min = 10, max = 40 }) => {
  // Defensive coercion — if upstream ever hands us NaN / undefined / a string,
  // fall back to `min` so the stepper never crashes or emits NaN. In practice
  // `displayRecipe.coffeeGrams` comes from `repairHandBrewRecipe` which
  // validates the number, but this is a cheap safety net.
  const safeDose =
    typeof dose === 'number' && Number.isFinite(dose) ? dose : min;

  // Use the current `safeDose` (always fresh thanks to useRepeatPress's
  // latest-ref pattern pulling from the parent's useState on every tick).
  const handleDecrement = useCallback(() => {
    onChange(Math.max(min, safeDose - 1));
  }, [onChange, safeDose, min]);

  const handleIncrement = useCallback(() => {
    onChange(Math.min(max, safeDose + 1));
  }, [onChange, safeDose, max]);

  const canDec = useCallback(() => safeDose > min, [safeDose, min]);
  const canInc = useCallback(() => safeDose < max, [safeDose, max]);

  const boundaryBump = useCallback(() => {
    haptic.medium().catch(() => {});
  }, []);

  const decHandlers = useRepeatPress({
    onTick: handleDecrement,
    canTick: canDec,
    onBoundary: boundaryBump,
  });
  const incHandlers = useRepeatPress({
    onTick: handleIncrement,
    canTick: canInc,
    onBoundary: boundaryBump,
  });

  const atMin = safeDose <= min;
  const atMax = safeDose >= max;

  return (
    <div
      style={{
        background: C.bg,
        borderRadius: 10,
        padding: '10px 4px',
        textAlign: 'center',
      }}
    >
      <Coffee size={14} color={C.accent} style={{ marginBottom: 4 }} />
      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        Coffee
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        <button
          {...decHandlers}
          style={{ ...STEPPER_BTN_STYLE, opacity: atMin ? 0.4 : 1 }}
          aria-label="Decrease coffee dose"
        >
          <span aria-hidden="true" style={STEPPER_GLYPH_STYLE}>
            <Minus size={16} strokeWidth={3} />
          </span>
        </button>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 20,
            color: C.text,
            minWidth: 36,
            textAlign: 'center',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {safeDose}g
        </div>
        <button
          {...incHandlers}
          style={{ ...STEPPER_BTN_STYLE, opacity: atMax ? 0.4 : 1 }}
          aria-label="Increase coffee dose"
        >
          <span aria-hidden="true" style={STEPPER_GLYPH_STYLE}>
            <Plus size={16} strokeWidth={3} />
          </span>
        </button>
      </div>
    </div>
  );
};
