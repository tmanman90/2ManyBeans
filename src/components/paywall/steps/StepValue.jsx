// Step 1 — Value. Matched to the MFP value screen: centered two-line
// headline with the gold tail phrase, full-bleed hero band, three bare
// value rows, pill CTA, "Not right now" ghost.
//
// Rules that bind here:
// - NO nav row, NO close X. The only exit is the ghost button.
// - NO prices and NO legal row on this step.
// - Never blocks on RevenueCat: renders identically while offerings are
//   loading or errored. The CTA label upgrades from the warmed trial cache
//   to the live offering when it lands, and NEVER says "trial" unless a
//   real free introductory offer exists (Apple 3.1.2).

import { useEffect, useState } from 'react';
import { PAYWALL_COPY, PAYWALL_HERO_SRC } from '../paywallCopy';
import { readWarmedTrial, trialFromOffering } from '../../../lib/trialOffer';
import ValueRow from '../ValueRow';
import PaywallCTABar from '../PaywallCTABar';

export default function StepValue({ trigger, offering, onContinue, onClose }) {
  const copy = PAYWALL_COPY[trigger] ?? PAYWALL_COPY.generic;

  // Same pattern as R13Paywall.jsx:156 — read the warmed cache synchronously
  // so first paint already has the right CTA, then upgrade once the live
  // offering lands (the warm can still be in flight on a fast open).
  const [trial, setTrial] = useState(readWarmedTrial);
  useEffect(() => {
    if (trial || !offering) return;
    setTrial(trialFromOffering(offering));
  }, [offering, trial]);

  const ctaLabel = trial ? `Start my ${trial.label}` : 'See my plans';

  return (
    <>
      <div className="pw-step-scroll">
        <div
          className="pw-head-c pw-in"
          style={{ '--pw-d': '0ms', marginTop: 'calc(env(safe-area-inset-top, 0px) + 88px)' }}
        >
          <h2 className="pw-h1">
            {copy.head}
            <br />
            <span className="pw-hl">{copy.tail}</span>
          </h2>
        </div>

        <div className="pw-hero-band pw-in" style={{ '--pw-d': '60ms' }}>
          <img src={PAYWALL_HERO_SRC} alt="Professor Ruphus with a gold coffee cup" />
        </div>

        <div className="pw-value-rows">
          {copy.rows.map((row, i) => (
            <ValueRow key={row.label} {...row} delay={120 + i * 60} />
          ))}
        </div>
      </div>

      <PaywallCTABar
        label={ctaLabel}
        onPress={onContinue}
        ghostLabel="Not right now"
        onGhost={onClose}
        delay={300}
      />
    </>
  );
}
