// Share card components — rendered off-screen, captured as images via modern-screenshot.
// RecipeShareCard: Aiden brew recipe card
// TastingShareCard: tasting review card
// captureShareCard(): DOM-to-PNG with iOS-safe settings
//
// modern-screenshot is dynamic-imported inside captureShareCard() only -- not
// statically at module top -- so the ~24KB DOM-to-PNG library stays out of
// the main bundle and only loads when the user actually taps Share. Callsites
// that only render the card (e.g. off-screen in JSX) never pay the cost.

import { forwardRef, useRef, useState, useLayoutEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts } from '../styles/theme';

// --- Constants ---

const CARD_WIDTH = 540; // CSS px, scale:2 = 1080px output
const CARD_HEIGHT = 540; // Fixed square for recipe card (matches 1:1 background image)
const CARD_BG = C.bg;   // #FAF6F1 warm cream (tasting card)
export const RECIPE_CARD_BG = '#2B5B4E'; // Dark green fallback matching chalkboard

const BOARD = { L: 67, R: 445, T: 110, B: 430 };
const BOARD_W = BOARD.R - BOARD.L;
const BOARD_H = BOARD.B - BOARD.T;

// Typography at 540px CSS (doubled to 1080px at scale:2)
const type = {
  cardTitle: { fontFamily: fonts.title, fontSize: 32, fontWeight: 700 },
  beanName: { fontFamily: fonts.heading, fontSize: 30, fontWeight: 700 },
  bigScore: { fontFamily: fonts.heading, fontSize: 72, fontWeight: 700 },
  body: { fontFamily: fonts.body, fontSize: 19, fontWeight: 600 },
  secondary: { fontFamily: fonts.body, fontSize: 16, fontWeight: 400 },
  watermark: { fontFamily: fonts.body, fontSize: 14, fontWeight: 400 },
};

// Chalk-style typography for recipe card (white on chalkboard)
const chalk = {
  beanName: { fontFamily: fonts.title, fontSize: 24, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.3)' },
  recipeTitle: { fontFamily: fonts.title, fontSize: 18, fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', textShadow: '0 0 1px rgba(0,0,0,0.2)' },
  paramLabel: { fontFamily: fonts.title, fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 },
  paramValue: { fontFamily: fonts.title, fontSize: 18, fontWeight: 700, color: '#fff', textShadow: '0 0 1px rgba(0,0,0,0.15)' },
  watermark: { fontFamily: fonts.title, fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.6)' },
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
      src="/images/professor-ruphus.webp"
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

// --- Recipe Share Card (Apothecary chalkboard background) ---

const ChalkParam = ({ label, value, labelStyle, valueStyle }) => {
  if (!value) return null;
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ ...(labelStyle || chalk.paramLabel), marginBottom: 4 }}>{label}</div>
      <div style={valueStyle || chalk.paramValue}>{value}</div>
    </div>
  );
};

function FitTitle({ text, maxSize = 26, minSize = 14, maxLines = 2, style }) {
  const ref = useRef(null);
  const [size, setSize] = useState(maxSize);

  useLayoutEffect(() => {
    let s = maxSize;
    setSize(s);
    const el = ref.current;
    if (!el) return;
    let raf;
    const check = () => {
      const lineHeight = 1.15;
      const maxH = Math.ceil(s * lineHeight * maxLines) + 2;
      if (el.scrollHeight > maxH && s > minSize) {
        s -= 1;
        setSize(s);
        raf = requestAnimationFrame(check);
      }
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [text, maxSize, minSize, maxLines]);

  return (
    <div ref={ref} style={{
      ...style,
      fontSize: size,
      lineHeight: 1.15,
      textAlign: 'center',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      hyphens: 'auto',
      display: '-webkit-box',
      WebkitLineClamp: maxLines,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }}>{text}</div>
  );
}

export const RecipeShareCard = forwardRef(({ bean, recipe }, ref) => {
  const { name, roaster, origin, process, bagNotes } = bean || {};
  const { ratio, bloom, grindSingleShot, grindBatch } = recipe || {};

  const subtitle = [roaster, origin, process].filter(Boolean).join(' \u00B7 ');

  return (
    <div ref={ref} style={{
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 20,
      background: RECIPE_CARD_BG,
    }}>
      {/* Background image — absolute, behind all content */}
      <img
        src="/images/share-card-layout-half-v2.png"
        alt=""
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Easter egg — Tina on a jar label */}
      <div style={{
        position: 'absolute',
        bottom: 68,
        left: 28,
        fontSize: 6,
        fontFamily: fonts.body,
        fontWeight: 600,
        color: '#5C3D2E',
        opacity: 0.7,
        letterSpacing: 0.5,
        pointerEvents: 'none',
      }}>
        Tina
      </div>

      {/* Chalkboard text zone — anchored to measured chalkboard bbox */}
      <div style={{
        position: 'absolute',
        left: BOARD.L + 14,
        top: BOARD.T + 48,
        width: BOARD_W - 28,
        height: BOARD_H - 48 - 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 6,
        overflow: 'hidden',
      }}>
        <FitTitle
          text={name}
          maxSize={26}
          minSize={14}
          maxLines={2}
          style={{ ...chalk.beanName, width: '100%' }}
        />

        {subtitle && (
          <div style={{
            ...chalk.recipeTitle,
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 1.25,
            width: '100%',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}>
            {subtitle}
          </div>
        )}

        {bagNotes && bagNotes !== '(not logged)' && (
          <div style={{
            fontFamily: fonts.title,
            fontSize: 12,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.55)',
            textAlign: 'center',
            width: '92%',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            letterSpacing: 0.3,
            marginTop: 2,
          }}>
            {bagNotes}
          </div>
        )}

        <div style={{ width: 54, height: 1, background: 'rgba(255,255,255,0.32)', margin: '6px 0 2px' }} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: 12,
          rowGap: 8,
          width: '100%',
        }}>
          <ChalkParam label="Ratio" value={ratio} labelStyle={{ ...chalk.paramLabel, fontSize: 11 }} valueStyle={{ ...chalk.paramValue, fontSize: 17 }} />
          <ChalkParam label="Bloom" value={bloom} labelStyle={{ ...chalk.paramLabel, fontSize: 11 }} valueStyle={{ ...chalk.paramValue, fontSize: 17 }} />
          <ChalkParam label="Grind (SS)" value={grindSingleShot} labelStyle={{ ...chalk.paramLabel, fontSize: 11 }} valueStyle={{ ...chalk.paramValue, fontSize: 17 }} />
          <ChalkParam label="Grind (Batch)" value={grindBatch} labelStyle={{ ...chalk.paramLabel, fontSize: 11 }} valueStyle={{ ...chalk.paramValue, fontSize: 17 }} />
        </div>
      </div>

      {/* Chalk wordmark header — top-center of chalkboard */}
      <img
        src="/images/2manybeans-logo-transparent.png"
        alt="2manybeans"
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          top: BOARD.T + 2,
          left: BOARD.L + BOARD_W / 2,
          transform: 'translateX(-50%) rotate(-1deg)',
          width: 135,
          height: 'auto',
          filter: 'brightness(0) invert(1) drop-shadow(0 0 0.5px rgba(255,255,255,0.8)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
          opacity: 0.82,
          pointerEvents: 'none',
        }}
      />
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
 * @param {object} ref - React ref to the card element
 * @param {object} [opts] - Options
 * @param {string} [opts.backgroundColor] - Override background color (e.g. dark green for recipe card)
 */
export async function captureShareCard(ref, opts = {}) {
  if (capturing) return null;
  capturing = true;
  try {
    // Fonts load from disk on native — only wait on web PWA
    if (!Capacitor.isNativePlatform()) {
      await document.fonts.ready;
    }
    // WKWebView paint delay
    await new Promise(r => setTimeout(r, 100));

    // Lazy-load modern-screenshot. Only pulled into the bundle when the
    // user actually taps Share.
    const { domToPng } = await import('modern-screenshot');

    const dataUrl = await domToPng(ref.current, {
      scale: 2,
      backgroundColor: opts.backgroundColor || CARD_BG,
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
      const retry = await domToPng(ref.current, {
        scale: 2,
        backgroundColor: opts.backgroundColor || CARD_BG,
        drawImageInterval: 400,
        fetch: {
          bypassingCache: true,
          placeholderImage: 'data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        },
        font: { preferredFormat: 'woff2' },
      });
      return (!retry || retry.length < 1000) ? null : retry;
    }

    return dataUrl;
  } finally {
    capturing = false;
  }
}
