// Painterly SVG coffee bag thumbnail. Seeded by bean.id so each bean gets a
// stable earthy color + glyph variant without needing a real photo.
import { C } from '../styles/theme';

const HUES = ['#B07540', '#8F5A2E', '#5C3D2E', '#9D6A3E', '#6E4730', '#A46D44'];
const GLYPHS = ['dots', 'star', 'ring', 'bar'];

function seedFrom(id) {
  return String(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function BeanThumb({ bean, size = 56 }) {
  const seed = seedFrom(bean?.id);
  const bagColor = HUES[seed % HUES.length];
  const glyph = GLYPHS[seed % GLYPHS.length];
  const labelTone = C.amberBg;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      style={{ display: 'block' }}
      role="img"
      aria-label="coffee bag"
    >
      <rect x="0" y="0" width="56" height="56" rx="10" fill={labelTone} />
      <ellipse cx="28" cy="50" rx="16" ry="2" fill="rgba(92,61,46,0.15)" />
      <path
        d="M14 16 Q14 13 17 13 L39 13 Q42 13 42 16 L42 46 Q42 49 39 49 L17 49 Q14 49 14 46 Z"
        fill={bagColor}
      />
      <path d="M14 17 L42 17" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
      <path d="M17 13 Q28 10 39 13" stroke="rgba(0,0,0,0.2)" strokeWidth="1" fill="none" />
      <rect x="19" y="26" width="18" height="13" rx="1.5" fill={labelTone} opacity="0.92" />
      {glyph === 'dots' && (
        <>
          <circle cx="25" cy="32" r="1.3" fill={bagColor} />
          <circle cx="28" cy="32" r="1.3" fill={bagColor} />
          <circle cx="31" cy="32" r="1.3" fill={bagColor} />
        </>
      )}
      {glyph === 'star' && (
        <path
          d="M28 29 L29.2 31.5 L32 31.9 L30 33.8 L30.5 36.5 L28 35.2 L25.5 36.5 L26 33.8 L24 31.9 L26.8 31.5 Z"
          fill={bagColor}
        />
      )}
      {glyph === 'ring' && (
        <>
          <circle cx="28" cy="32.5" r="3" fill="none" stroke={bagColor} strokeWidth="1.2" />
          <circle cx="28" cy="32.5" r="1" fill={bagColor} />
        </>
      )}
      {glyph === 'bar' && (
        <>
          <rect x="23" y="30" width="10" height="1.5" fill={bagColor} />
          <rect x="23" y="33" width="10" height="1.5" fill={bagColor} opacity="0.5" />
          <rect x="23" y="35.5" width="7" height="1.5" fill={bagColor} opacity="0.3" />
        </>
      )}
    </svg>
  );
}
