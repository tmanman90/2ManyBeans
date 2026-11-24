import { assetUrl } from '../lib/assetUrl';
import { C, fonts } from '../styles/theme';
import { useCelebrationClose } from '../hooks/useCelebrationClose';
import { Modal } from './Modal';

const MASK = 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)';

// A Ruphus clip with a title in a centered sheet (bag finished, first bean).
// It closes itself on the clip's clock: `afterPlayMs` once the clip plays,
// never past 4 s from opening, so a slow or failed clip cannot keep it up.
// `onDone` runs only for that automatic close; the X calls `onClose`.
export function CelebrationSheet({ open, clip, title, subtitle, afterPlayMs, onDone, onClose }) {
  const handlePlay = useCelebrationClose({ active: open, afterPlayMs, maxMs: 4000, onDone });
  return (
    <Modal open={open} onClose={onClose} title="" centered>
      <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
        <video
          src={assetUrl(`/images/ruphus-animations/${clip}.mp4`)}
          poster={assetUrl(`/images/ruphus-animations/${clip}-poster.jpg`)}
          autoPlay muted playsInline
          onPlay={handlePlay}
          style={{
            width: 200, height: 200, objectFit: 'contain', margin: '0 auto 12px',
            display: 'block',
            WebkitMaskImage: MASK,
            maskImage: MASK,
          }}
        />
        <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.text, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: C.textMuted }}>
          {subtitle}
        </div>
      </div>
    </Modal>
  );
}
