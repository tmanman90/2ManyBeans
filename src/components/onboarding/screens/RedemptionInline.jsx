// RedemptionInline — "Have an invite code?" affordance shared by R13 and
// R13b (CREATIVE_SPEC.md §2 R13 + Appendix A6). A collapsed text button
// expands into an uppercase-normalized code input + Redeem button + a
// reserved-height inline error line. On success it collapses itself and
// hands off to the caller via onRedeemed — the caller owns the celebration
// beat and the terminal finish() call, this component owns ONLY the
// redeem-code request/response cycle.
//
// redeemCode() (src/lib/redeemCode.js) is the ONLY redemption implementation
// — no second one lives here (loop.yaml R7).
import { useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { C, fonts, radius } from '../../../styles/theme';
import { GlassButton } from '../../GlassButton';
import { haptic } from '../../../lib/haptics';
import { redeemCode, RedeemError } from '../../../lib/redeemCode';
import { scrollOnFocus } from '../../../lib/formHelpers';

// Appendix A6 (revised D15) keyed by the REAL api/redeem-code.js reason
// codes (the server collapses code_exhausted/expired into invalid_code on
// purpose). Unknown/other codes (including network failures with no code)
// fall through to the generic line.
const ERROR_COPY = {
  invalid_input: "That code doesn't look right. Check it and try again.",
  invalid_code: "That code doesn't look right. Check it and try again.",
  already_redeemed: "That code's already been used.",
  has_active_subscription: 'You already have full access. Nothing to redeem.',
  email_not_verified: 'Please verify your email address first.',
  rate_limited: 'Too many attempts. Wait a bit and try again.',
};
const ERROR_COPY_GENERIC = 'Couldn\'t reach the cafe. Try again in a moment.';

export default function RedemptionInline({ onRedeemed }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [shakeTick, setShakeTick] = useState(0);
  const inputRef = useRef(null);

  const handleToggle = () => {
    haptic.selection();
    setOpen((o) => {
      const next = !o;
      if (next) {
        // Let the expand transition start before focusing so iOS doesn't
        // fight the grid-rows animation with its own scroll-into-view.
        setTimeout(() => inputRef.current?.focus(), 60);
      }
      return next;
    });
  };

  const handleChange = (e) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Test seam (additive, no-op in prod): lets the onboarding harness
      // inject success/failure fixtures without a live redeem-code call.
      const redeem = window.__ONBOARDING_TEST__?.redeemCode || redeemCode;
      await redeem(trimmed);
      // Success — collapse the input, hand off to the caller. The caller
      // (R13 / R13b) owns entitlement-refresh verification, the
      // celebration beat, and the terminal finish() call.
      setBusy(false);
      setOpen(false);
      onRedeemed?.();
    } catch (err) {
      const reasonCode = err instanceof RedeemError ? err.code : null;
      setError(ERROR_COPY[reasonCode] || ERROR_COPY_GENERIC);
      setShakeTick((t) => t + 1);
      setBusy(false);
      // Input contents are kept on purpose — retry forever, never disabled.
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          minHeight: 44,
          background: 'transparent',
          border: 'none',
          color: C.textMuted,
          fontFamily: fonts.body,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Have an invite code?
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: reduce ? 'none' : 'grid-template-rows 200ms ease-out',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            key={shakeTick}
            className={!reduce && error ? 'redeem-shake' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={handleChange}
                onFocus={scrollOnFocus}
                onKeyDown={(e) => e.key === 'Enter' && !busy && handleSubmit()}
                placeholder="2MANY-XXXXX"
                disabled={busy}
                style={{
                  flex: 1,
                  minHeight: 44,
                  minWidth: 0,
                  fontSize: 16,
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color: C.text,
                  background: C.cream,
                  border: `1.5px solid ${error ? C.red : C.hairline}`,
                  borderRadius: radius.md,
                  padding: '10px 14px',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              />
              <GlassButton
                compact
                onClick={handleSubmit}
                disabled={busy || !code.trim()}
              >
                {busy ? 'Redeeming…' : 'Redeem'}
              </GlassButton>
            </div>

            {/* Reserved-height error line so the layout never jumps */}
            <div
              style={{
                minHeight: 16,
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: 600,
                color: C.red,
                lineHeight: 1.3,
              }}
            >
              {error || ''}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes redeem-shake {
            0%, 100% { transform: translateX(0); }
            15% { transform: translateX(-2px); }
            30% { transform: translateX(2px); }
            45% { transform: translateX(-2px); }
            60% { transform: translateX(2px); }
            75% { transform: translateX(-2px); }
            90% { transform: translateX(2px); }
          }
          .redeem-shake { animation: redeem-shake 160ms ease-in-out; }
        }
      `}</style>
    </div>
  );
}
