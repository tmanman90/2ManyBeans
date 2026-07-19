// Brand wordmark. Mask-tinted PNG rendered in accent color.
// The source artwork is 1600 × 486 (3.292:1); keeping that ratio here avoids
// the shallow mask box that used to make the header mark look undersized.
import { C } from '../styles/theme';

const WORDMARK_ASPECT = 1600 / 486;

const variantStyles = {
  // Chrome keeps a compact 156px ink width while retaining enough height for
  // the full source ratio (about 47px), so it remains legible beside settings.
  chrome: { width: 156 },
  // Hero is intentionally larger than chrome without becoming a full-bleed
  // banner. `min(100%, 280px)` keeps it safe on narrow sign-in viewports.
  hero: { width: 'min(100%, 280px)' },
};

export function Wordmark({ color, variant = 'chrome', style = {} } = {}) {
  const tint = color ?? C.accent;
  const size = variantStyles[variant] ?? variantStyles.chrome;
  return (
    <div
      aria-label="2manybeans"
      role="img"
      data-wordmark-variant={variant}
      style={{
        ...size,
        aspectRatio: WORDMARK_ASPECT,
        backgroundColor: tint,
        WebkitMaskImage: 'url(/images/wordmark@2x.png)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskImage: 'url(/images/wordmark@2x.png)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        // Warm espresso drop-shadow for legibility on light paper backgrounds
        filter: 'drop-shadow(0 1px 2px rgba(74,47,30,0.18))',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
