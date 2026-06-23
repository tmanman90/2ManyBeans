// Brand wordmark. Mask-tinted PNG rendered in accent color.
// Used in App header (both rotation and non-rotation branches).
// Optional `color` prop for one-off tint overrides — defaults to C.accent
// so all existing call sites (which pass no props) are unaffected.
import { C } from '../styles/theme';

export function Wordmark({ color } = {}) {
  const tint = color ?? C.accent;
  return (
    <div
      aria-label="2manybeans"
      role="img"
      style={{
        height: 32,
        width: 180,
        background: tint,
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
        flexShrink: 0,
      }}
    />
  );
}
