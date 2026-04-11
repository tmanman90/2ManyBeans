// Dev-only test page for share card design iteration
// Renders 3 RecipeShareCard variants for visual QA and autoresearch scoring

import { useRef, useState } from 'react';
import { RecipeShareCard, captureShareCard, RECIPE_CARD_BG } from '../components/ShareCard';

const SAMPLE_CARDS = [
  {
    id: 'full',
    label: 'Full Recipe',
    bean: {
      name: 'Ethiopia Yirgacheffe Kochere',
      roaster: 'Onyx Coffee Lab',
      origin: 'Ethiopia',
      process: 'Washed',
    },
    recipe: {
      ratio: '1:16',
      bloom: '2x 30s',
      grindSingleShot: '4.2',
      grindBatch: '5.8',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal (ratio + bloom only)',
    bean: {
      name: 'Colombia Huila',
      roaster: 'Counter Culture',
      origin: 'Colombia',
      process: 'Natural',
    },
    recipe: {
      ratio: '1:15',
      bloom: '2.5x 45s',
      grindSingleShot: null,
      grindBatch: null,
    },
  },
  {
    id: 'longname',
    label: 'Long Bean Name',
    bean: {
      name: 'Guatemala Huehuetenango La Libertad Finca El Injerto Bourbon',
      roaster: 'George Howell Coffee Company',
      origin: 'Guatemala',
      process: 'Honey',
    },
    recipe: {
      ratio: '1:17',
      bloom: '2x 35s',
      grindSingleShot: '3.8',
      grindBatch: '5.2',
    },
  },
];

export const TestShareCard = () => {
  const refs = useRef({});
  const [captures, setCaptures] = useState({});
  const [capturing, setCapturing] = useState(null);

  const handleCapture = async (id) => {
    const ref = refs.current[id];
    if (!ref) return;
    setCapturing(id);
    try {
      const dataUrl = await captureShareCard({ current: ref }, { backgroundColor: RECIPE_CARD_BG });
      setCaptures(prev => ({ ...prev, [id]: dataUrl }));
    } finally {
      setCapturing(null);
    }
  };

  const handleCaptureAll = async () => {
    for (const card of SAMPLE_CARDS) {
      await handleCapture(card.id);
    }
  };

  return (
    <div style={{ padding: 40, background: '#1a1a1a', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: '#fff', fontFamily: 'system-ui', fontSize: 24, margin: 0 }}>
          Share Card Test Page
        </h1>
        <button
          onClick={handleCaptureAll}
          style={{
            padding: '10px 20px',
            background: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'system-ui',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Capture All
        </button>
      </div>

      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        {SAMPLE_CARDS.map(card => (
          <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ color: '#999', fontFamily: 'system-ui', fontSize: 13, fontWeight: 600 }}>
              {card.label}
            </div>

            {/* Live rendered card */}
            <div data-card-id={card.id}>
              <RecipeShareCard
                ref={el => { refs.current[card.id] = el; }}
                bean={card.bean}
                recipe={card.recipe}
              />
            </div>

            <button
              onClick={() => handleCapture(card.id)}
              disabled={capturing === card.id}
              style={{
                padding: '8px 16px',
                background: capturing === card.id ? '#666' : '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: capturing === card.id ? 'wait' : 'pointer',
                fontFamily: 'system-ui',
                fontSize: 13,
              }}
            >
              {capturing === card.id ? 'Capturing...' : 'Capture PNG'}
            </button>

            {/* Captured output preview */}
            {captures[card.id] && (
              <div>
                <div style={{ color: '#666', fontFamily: 'system-ui', fontSize: 11, marginBottom: 4 }}>
                  Captured output (1080x1080):
                </div>
                <img
                  src={captures[card.id]}
                  alt={`Captured ${card.label}`}
                  style={{ width: 270, height: 270, borderRadius: 10, border: '1px solid #333' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
