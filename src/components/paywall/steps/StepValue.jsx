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
import { PAYWALL_COPY, PAYWALL_HERO_LOOP, PAYWALL_HERO_POSTER } from '../paywallCopy';
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

  // Honour the OS setting: no decoder, no loop, just the still.
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

        {/*
          Hero. The band carries NO mask: lessons.md records that CSS masks on
          a composited <video> silently vanish in device WKWebView, and neither
          the simulator nor desktop WebKit reproduces it. The top and bottom
          dissolves are unnecessary: the band ground and the canvas are the
          same flat colour as the clip's own background, so there is no edge
          to hide in the first place.
          Under reduced motion we render the poster still rather than a paused
          video, so no decoder is spun up at all.
        */}
        <div className="pw-hero-band pw-in" style={{ '--pw-d': '60ms' }}>
          {reduceMotion ? (
            <img src={PAYWALL_HERO_POSTER} alt="Professor Ruphus with a gold coffee cup" />
          ) : (
            <video
              src={PAYWALL_HERO_LOOP}
              poster={PAYWALL_HERO_POSTER}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label="Professor Ruphus with a gold coffee cup"
            />
          )}
          <span className="pw-hero-edge pw-hero-edge-l" aria-hidden="true" />
          <span className="pw-hero-edge pw-hero-edge-r" aria-hidden="true" />
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
