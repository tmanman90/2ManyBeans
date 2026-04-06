// Share card components — rendered off-screen, captured as images via modern-screenshot
// RecipeShareCard: Aiden brew recipe card
// TastingShareCard: tasting review card
// captureShareCard(): DOM-to-PNG with iOS-safe settings

import { forwardRef } from 'react';
import { domToPng } from 'modern-screenshot';
import { C, fonts } from '../styles/theme';

// --- Constants ---

const CARD_WIDTH = 540; // CSS px, scale:2 = 1080px output
const CARD_BG = C.bg;   // #FAF6F1 warm cream

// Typography at 540px CSS (doubled to 1080px at scale:2)
const type = {
  cardTitle: { fontFamily: fonts.title, fontSize: 32, fontWeight: 700 },
  beanName: { fontFamily: fonts.heading, fontSize: 30, fontWeight: 700 },
  bigScore: { fontFamily: fonts.heading, fontSize: 72, fontWeight: 700 },
  body: { fontFamily: fonts.body, fontSize: 19, fontWeight: 600 },
  secondary: { fontFamily: fonts.body, fontSize: 16, fontWeight: 400 },
  watermark: { fontFamily: fonts.body, fontSize: 14, fontWeight: 400 },
};

// --- Shared layout pieces ---

const cardStyle = {
  width: CARD_WIDTH,
  background: CARD_BG,
  padding: 40,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: C.text,
  borderRadius: 20, // 40px at 2x
};

// Hidden container — absolutely positioned off-screen so it renders but isn't visible
export const offScreenStyle = {
  position: 'fixed',
  left: -9999,
  top: 0,
  zIndex: -1,
  pointerEvents: 'none',
  opacity: 1, // must be visible for capture
};

const BeanPhoto = ({ photoUrl }) => {
  if (!photoUrl) return null;
  return (
    <div style={{
      width: '100%',
      height: 200,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
      background: C.cream,
    }}>
      <img
        src={photoUrl}
        alt=""
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
};

const BeanInfo = ({ name, roaster, origin, process }) => (
  <div style={{ textAlign: 'center', marginBottom: 16, width: '100%' }}>
    <div style={{ ...type.beanName, color: C.text, lineHeight: 1.2, marginBottom: 6 }}>
      {name}
    </div>
    <div style={{ ...type.secondary, color: C.textMuted, lineHeight: 1.4 }}>
      {[roaster, origin, process].filter(Boolean).join(' \u00B7 ')}
    </div>
  </div>
);

const CardFooter = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 24,
    paddingTop: 16,
    borderTop: `1px solid ${C.borderLight}`,
  }}>
    <img
      src="/images/professor-ruphus.png"
      alt=""
      style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 8 }}
    />
    <div style={{ textAlign: 'right' }}>
      <div style={{ ...type.cardTitle, color: C.accent, fontSize: 22 }}>
        2manybeans
      </div>
      <div style={{ ...type.watermark, color: C.textLight }}>
        Your coffee journal
      </div>
    </div>
  </div>
);

// Coffee bean SVG for star rating on cards (matches StarRating component)
const CardBean = ({ filled, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <ellipse
      cx="12" cy="12" rx="7.5" ry="10"
      transform="rotate(-15 12 12)"
      fill={filled ? '#8B6542' : 'none'}
      stroke={filled ? '#7A5535' : '#A0856B'}
      strokeWidth="1.4"
    />
    <path
      d="M12 3.5C10.5 7 10.2 10 11 12.5C11.8 15 11 18 12 21"
      stroke={filled ? '#5C3A1E' : '#A0856B'}
      strokeWidth="1.2"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const CardStarRating = ({ value }) => (
  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <CardBean key={n} filled={n <= value} size={22} />
    ))}
  </div>
);

// --- Recipe Share Card ---

const RecipeParamCell = ({ label, value }) => (
  <div style={{
    background: C.cream,
    borderRadius: 12,
    padding: '14px 10px',
    textAlign: 'center',
    flex: 1,
  }}>
    <div style={{ ...type.watermark, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ ...type.body, color: C.text }}>
      {value}
    </div>
  </div>
);

export const RecipeShareCard = forwardRef(({ bean, recipe }, ref) => {
  // Explicit allow-list: only safe display fields
  const { name, roaster, origin, process, photoUrl } = bean || {};
  const { ratio, bloom, grindSingleShot, grindBatch } = recipe || {};

  return (
    <div ref={ref} style={cardStyle}>
      <div style={{ ...type.cardTitle, color: C.accent, marginBottom: 16 }}>
        Brew Recipe
      </div>

      <BeanPhoto photoUrl={photoUrl} />
      <BeanInfo name={name} roaster={roaster} origin={origin} process={process} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        width: '100%',
        marginTop: 8,
      }}>
        {ratio && <RecipeParamCell label="Ratio" value={ratio} />}
        {bloom && <RecipeParamCell label="Bloom" value={bloom} />}
        {grindSingleShot && <RecipeParamCell label="Grind (SS)" value={grindSingleShot} />}
        {grindBatch && <RecipeParamCell label="Grind (Batch)" value={grindBatch} />}
      </div>

      <CardFooter />
    </div>
  );
});

RecipeShareCard.displayName = 'RecipeShareCard';

// --- Tasting Share Card ---

export const TastingShareCard = forwardRef(({ bean, tasting }, ref) => {
  // Explicit allow-list: only safe display fields
  const { name, roaster, origin, process, photoUrl } = bean || {};
  const { rating, oneWord, aroma, acidity, body, finish, sweetness } = tasting || {};

  const flavorTags = [aroma, acidity, body, finish, sweetness].filter(Boolean);

  return (
    <div ref={ref} style={cardStyle}>
      <div style={{ ...type.cardTitle, color: C.accent, marginBottom: 16 }}>
        Tasting Notes
      </div>

      <BeanPhoto photoUrl={photoUrl} />
      <BeanInfo name={name} roaster={roaster} origin={origin} process={process} />

      {rating > 0 && <CardStarRating value={rating} />}

      {oneWord && (
        <div style={{
          ...type.bigScore,
          color: C.accent,
          textAlign: 'center',
          lineHeight: 1.1,
          marginBottom: 16,
        }}>
          {oneWord}
        </div>
      )}

      {flavorTags.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
          marginTop: 4,
        }}>
          {flavorTags.map((tag, i) => (
            <span key={i} style={{
              ...type.secondary,
              background: C.cream,
              color: C.text,
              padding: '6px 14px',
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <CardFooter />
    </div>
  );
});

TastingShareCard.displayName = 'TastingShareCard';

// --- Capture utility ---

let capturing = false;

/**
 * Capture a share card ref as a PNG data URL.
 * Guards against concurrent captures. iOS-safe settings.
 */
export async function captureShareCard(ref) {
  if (capturing) return null;
  capturing = true;
  try {
    await document.fonts.ready;
    // WKWebView paint delay
    await new Promise(r => setTimeout(r, 100));

    const dataUrl = await domToPng(ref.current, {
      scale: 2,
      backgroundColor: CARD_BG,
      drawImageInterval: 200, // iOS needs more time for image rendering
      fetch: {
        bypassingCache: true,
        placeholderImage: 'data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      },
      font: { preferredFormat: 'woff2' },
    });

    // Retry once if blank (Safari foreignObject bug)
    if (!dataUrl || dataUrl.length < 1000) {
      await new Promise(r => setTimeout(r, 300));
      return domToPng(ref.current, {
        scale: 2,
        backgroundColor: CARD_BG,
        drawImageInterval: 400,
        fetch: {
          bypassingCache: true,
          placeholderImage: 'data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        },
        font: { preferredFormat: 'woff2' },
      });
    }

    return dataUrl;
  } finally {
    capturing = false;
  }
}
