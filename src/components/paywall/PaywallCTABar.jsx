// Bottom-pinned CTA bar shared by all three steps.
//
// Anatomy (top to bottom): optional fineprint (the exact charge, above the
// CTA per Apple's Jan 2026 guidance), the gold pill CTA, optional children
// (step 2 slots its Compare-plans link here), optional ghost button
// (step 1's "Not right now"), optional legal row.
//
// Motion: framer is allowed ONLY for whileTap here (the mockup's press is
// filter+scale in CSS :active; whileTap adds the same feel for pointer
// cancel correctness). No `animate` prop anywhere in the paywall tree —
// entrance/visibility is CSS-only (WKWebView has dropped framer `animate`
// in portaled trees twice).

import { m } from '../../lib/motion';

const TERMS_URL = 'https://2manybeans.vercel.app/terms.html';
const PRIVACY_URL = 'https://2manybeans.vercel.app/privacy-policy.html';

export default function PaywallCTABar({
  label,
  onPress,
  loading = false,
  disabled = false,
  fineprint = null,
  ghostLabel = null,
  onGhost,
  legal = false,
  onRestore,
  delay = 0,
  children = null,
}) {
  return (
    <div className="pw-cta-bar pw-in" style={{ '--pw-d': `${delay}ms` }}>
      {fineprint ? <p className="pw-fineprint pw-price">{fineprint}</p> : null}
      <m.button
        className={`pw-cta${loading ? ' is-loading' : ''}`}
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onClick={onPress}
        whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      >
        {loading ? (
          <>
            <span className="pw-spinner" />
            Processing&#8230;
          </>
        ) : (
          label
        )}
      </m.button>
      {children}
      {ghostLabel ? (
        <button className="pw-ghost" type="button" onClick={onGhost}>
          {ghostLabel}
        </button>
      ) : null}
      {legal ? (
        <div className="pw-legal">
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms of Use</a>
          <span>&#183;</span>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          <span>&#183;</span>
          <button type="button" onClick={onRestore}>Restore Purchases</button>
        </div>
      ) : null}
    </div>
  );
}
