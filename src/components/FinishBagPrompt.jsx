// Finish bag rating prompt -- intercepts finish flow for unrated beans
// Single modal with view swapping: 'prompt' (quick rate) | 'fullReview'
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { C, fonts, type, radius } from '../styles/theme';
import { today } from '../lib/peakStatus';
import { convertTastingScores } from '../lib/professorRuphus';
import { Modal } from './Modal';
import { StarRating } from './StarRating';
import { TastingForm } from './TastingForm';
import { Btn } from './Btn';

export const FinishBagPrompt = ({ open, onClose, bean, onFinish, onAddTasting, onUpdateTasting }) => {
  const [view, setView] = useState('prompt');
  const [rating, setRating] = useState(0);
  const [oneWord, setOneWord] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [celebrating, setCelebrating] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setView('prompt');
      setRating(0);
      setOneWord('');
      setSaving(false);
      setError(null);
      setCelebrating(false);
    }
  }, [open]);

  if (!bean) return null;

  const beanLabel = bean.roaster ? `${bean.name} -- ${bean.roaster}` : bean.name;

  const handleQuickSave = async () => {
    if (saving || rating === 0) return;
    setError(null);
    setSaving(true);
    try {
      await onAddTasting({
        beanId: bean.id, date: today(), rating,
        oneWord, aroma: '', firstSip: '', acidity: '',
        sweetness: '', body: '', finish: '', notes: '', changeTomorrow: '',
      });
      await onFinish(bean.id);
      setCelebrating(true);
      setTimeout(() => onClose('Saved & finished!'), 2200);
    } catch (err) {
      console.error('Quick save failed:', err);
      setError('Failed to save rating. Try again.');
      setSaving(false);
    }
  };

  const handleFullReview = async (tastingData) => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const data = { ...tastingData, date: today() };
      const tastingId = await onAddTasting(data);

      // Spider chart conversion if meaningful text present
      if (tastingId) {
        const hasText = data.aroma || data.acidity || data.sweetness ||
          data.body || data.firstSip || data.finish;
        if (hasText) {
          convertTastingScores(data, bean)
            .then(scores => { onUpdateTasting(tastingId, { tastingScores: scores }); })
            .catch(err => console.log('Score conversion skipped:', err.message));
        }
      }

      await onFinish(bean.id);
      setCelebrating(true);
      setView('prompt');
      setTimeout(() => onClose('Saved & finished!'), 2200);
    } catch (err) {
      console.error('Full review save failed:', err);
      setError('Failed to save review. Try again.');
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await onFinish(bean.id);
      onClose();
    } catch (err) {
      console.error('Skip finish failed:', err);
      setError('Failed to finish bag. Try again.');
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: radius.sm,
    border: `1px solid ${C.border}`,
    fontFamily: fonts.body,
    fontSize: 16,
    background: C.bgDeep,
    color: C.text,
    boxSizing: 'border-box',
    outline: 'none',
    WebkitAppearance: 'none',
  };

  if (view === 'fullReview') {
    return (
      <Modal open={open} onClose={() => onClose()} title="Full Review">
        <div style={{ marginBottom: 12 }}>
          <span
            onClick={() => setView('prompt')}
            style={{
              ...type.body,
              color: C.accent,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 700,
              minHeight: 44,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ArrowLeft size={14} /> Back
          </span>
        </div>
        {error && (
          <div style={{
            background: C.redBg,
            color: C.red,
            padding: '10px 14px',
            borderRadius: radius.sm,
            ...type.body,
            marginBottom: 14,
          }}>
            {error}
          </div>
        )}
        <TastingForm
          beanId={bean.id}
          beanLabel={beanLabel}
          onSubmit={handleFullReview}
          submitLabel="Save & Finish"
          disabled={saving}
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={() => onClose()} title={celebrating ? '' : 'Rate this bean?'} centered>
      {celebrating && (
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <video
            src="/images/ruphus-animations/ruphus-fist-pump.mp4"
            autoPlay muted playsInline
            style={{
              width: 200, height: 200, objectFit: 'contain', margin: '0 auto 16px',
              display: 'block',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            }}
          />
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 22,
            color: C.text,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            marginBottom: 6,
          }}>
            Bag finished!
          </div>
          <div style={{ ...type.bodyL, color: C.textMuted }}>
            On to the next one, brewer.
          </div>
        </div>
      )}

      {!celebrating && <>
      {/* Bean identity */}
      <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${C.hairline}` }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 20,
          fontWeight: 600,
          color: C.text,
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
        }}>
          {bean.name}
        </div>
        {bean.roaster && (
          <div style={{ ...type.body, color: C.textMuted, marginTop: 4 }}>{bean.roaster}</div>
        )}
      </div>

      {error && (
        <div style={{
          background: C.redBg,
          color: C.red,
          padding: '10px 14px',
          borderRadius: radius.sm,
          ...type.body,
          marginBottom: 14,
        }}>
          {error}
        </div>
      )}

      {/* Star rating */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ ...type.label, color: C.textMuted, display: 'block', marginBottom: 10 }}>Rating</label>
        <StarRating value={rating} onChange={setRating} size={32} />
      </div>

      {/* One-word input */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ ...type.label, color: C.textMuted, display: 'block', marginBottom: 8 }}>One word</label>
        <input
          value={oneWord}
          onChange={e => setOneWord(e.target.value)}
          placeholder="e.g. Smooth"
          style={inputStyle}
        />
      </div>

      {/* Quick Save */}
      <Btn
        variant="primary"
        onClick={handleQuickSave}
        disabled={saving || rating === 0}
        style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
      >
        Quick Save
      </Btn>

      {/* Full Review */}
      <Btn
        variant="secondary"
        onClick={() => setView('fullReview')}
        disabled={saving}
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
      >
        Full Review
      </Btn>

      {/* Skip */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <span
          onClick={handleSkip}
          style={{
            ...type.body,
            color: C.textLight,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.5 : 1,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Just finish it
        </span>
      </div>
      </>}
    </Modal>
  );
};
