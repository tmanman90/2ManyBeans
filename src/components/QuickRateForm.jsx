// Quick Rate — lightweight star rating + note for Quick Recipe flow
import { useState, useEffect } from 'react';
import { C, fonts } from '../styles/theme';
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
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        {beanName && (
          <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text, marginBottom: 16 }}>
            {beanName}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <StarRating value={rating} onChange={setRating} size={32} />
        </div>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Quick notes (optional)"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`, fontFamily: fonts.body,
            fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
            resize: 'none',
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{error}</div>
        )}

        <Btn
          variant="primary"
          onClick={handleSubmit}
          disabled={!rating || submitting}
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
        >
          {submitting ? 'Saving...' : 'Save Rating'}
        </Btn>
      </div>
    </Modal>
  );
};
