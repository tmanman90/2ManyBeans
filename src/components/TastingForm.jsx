// Reusable tasting form — extracted from TastingTab
// Used in both TastingTab (form mode) and FinishBagPrompt (full review)
import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { StarRating } from './StarRating';
import { Btn } from './Btn';

const emptyForm = { aroma: '', firstSip: '', acidity: '', sweetness: '', body: '', finish: '', oneWord: '', rating: 0, notes: '', changeTomorrow: '' };

const tastingFields = {
  aroma: 'Aroma', firstSip: 'First sip', acidity: 'Acidity', sweetness: 'Sweetness',
  body: 'Body', finish: 'Finish', oneWord: 'One-word score', notes: 'Notes', changeTomorrow: 'Change tomorrow?',
};

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: `1px solid ${C.border}`, fontFamily: fonts.body,
  fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
};

export { emptyForm };

export const TastingForm = ({ beanId, beanLabel, beans, initialForm, onSubmit, submitLabel = 'Save Tasting', disabled }) => {
  const [form, setForm] = useState(initialForm || emptyForm);
  const [sel, setSel] = useState(beanId || (beans?.[0]?.id || ''));

  // Reset sel if current selection is no longer in the beans list
  useEffect(() => {
    if (!beanId && beans && beans.length > 0 && !beans.find(b => b.id === sel)) {
      setSel(beans[0].id);
    }
  }, [beanId, beans, sel]);

  const handleSubmit = () => {
    const resolvedBeanId = beanId || sel;
    if (!resolvedBeanId) return;
    onSubmit({ beanId: resolvedBeanId, ...form, rating: form.rating || null });
  };

  return (
    <div style={{ ...journalCard, padding: 18 }}>
      {/* Bean selector — only when no fixed beanId */}
      {!beanId && beans && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>Bean</label>
          <select value={sel} onChange={e => setSel(e.target.value)} style={inputStyle}>
            {beans.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.jarSlot})</option>)}
          </select>
        </div>
      )}

      {/* Read-only bean label when fixed */}
      {beanId && beanLabel && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>Bean</label>
          <div style={{ fontSize: 14, color: C.text, padding: '8px 0' }}>{beanLabel}</div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 6 }}>Rating</label>
        <StarRating value={form.rating} onChange={r => setForm(p => ({ ...p, rating: r }))} size={28} />
      </div>
      {Object.entries(tastingFields).map(([key, label]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
          {key === 'notes' ? (
            <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={e => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350); }} />
          ) : (
            <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle}
              onFocus={e => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350); }} />
          )}
        </div>
      ))}
      <Btn variant="primary" onClick={handleSubmit} disabled={disabled} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
        <Check size={14} /> {submitLabel}
      </Btn>
    </div>
  );
};
