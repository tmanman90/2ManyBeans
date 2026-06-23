// Quick Rate — lightweight star rating + note for Quick Recipe flow
import { useState, useEffect } from 'react';
import { C, fonts, type, radius } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { StarRating } from './StarRating';

export const QuickRateForm = ({ open, onClose, beanName, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when opened
  useEffect(() => {
    if (open) { setRating(0); setNotes(''); setError(null); }
  }, [open]);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ rating, notes: notes.trim() || '' });
      onClose();
    } catch (err) {
      console.error('Quick rate failed:', err);
      setError('Failed to save rating. Try again.');
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setRating(0);
    setNotes('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Quick Rate" centered>
      <div style={{ paddingBottom: 8 }}>
        {/* Bean name */}
        {beanName && (
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 18,
            fontWeight: 600,
            color: C.text,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: `1px solid ${C.hairline}`,
          }}>
            {beanName}
          </div>
        )}

        {/* Rating label + stars */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ ...type.label, color: C.textMuted, display: 'block', marginBottom: 12 }}>
            Your rating
          </label>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <StarRating value={rating} onChange={setRating} size={32} />
          </div>
        </div>

        {/* Notes textarea */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ ...type.label, color: C.textMuted, display: 'block', marginBottom: 8 }}>
            Quick notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional — what stood out?"
            rows={3}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: radius.sm,
              border: `1px solid ${C.border}`,
              fontFamily: fonts.body,
              fontSize: 16,
              background: C.bgDeep,
              color: C.text,
              boxSizing: 'border-box',
              resize: 'none',
              outline: 'none',
              WebkitAppearance: 'none',
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            ...type.caption,
            color: C.red,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        <Btn
          variant="primary"
          onClick={handleSubmit}
          disabled={!rating || submitting}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {submitting ? 'Saving...' : 'Save Rating'}
        </Btn>
      </div>
    </Modal>
  );
};
