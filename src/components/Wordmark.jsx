// Brand wordmark. Mask-tinted PNG rendered in accent color.
// Used in App header (both rotation and non-rotation branches).
import { C } from '../styles/theme';

export function Wordmark() {
  return (
    <div
      aria-label="2manybeans"
      role="img"
      style={{
        height: 32,
        width: 180,
        background: C.accent,
        WebkitMaskImage: 'url(/images/wordmark@2x.png)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskImage: 'url(/images/wordmark@2x.png)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        filter: 'drop-shadow(0 1px 3px rgba(250,246,241,0.8))',
      }}
    />
  );
}
