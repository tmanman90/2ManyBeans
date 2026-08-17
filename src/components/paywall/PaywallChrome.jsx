// Nav chrome for paywall steps 2 and 3: back arrow left, close X right.
// Step 1 renders NO chrome by design — no close X anywhere on the value
// screen; its only exit is the "Not right now" ghost button (mockup rule,
// matched to the MFP reference).

export default function PaywallChrome({ onBack, onClose }) {
  return (
    <div className="pw-nav-row">
      {onBack ? (
        <button className="pw-icon-btn" type="button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      ) : (
        <span />
      )}
      {onClose ? (
        <button className="pw-icon-btn" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
