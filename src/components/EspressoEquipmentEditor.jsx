import { useState } from 'react';
import { C, fonts, radius, type } from '../styles/theme';
import { usePreferences } from '../hooks/useUserProfile';
import { ESPRESSO_MACHINES, ESPRESSO_BASKETS, ESPRESSO_GRINDERS } from '../lib/brewMethods';
import { Btn } from './Btn';

const fieldStyle = { width: '100%', minHeight: 48, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: radius.sm, background: C.cream, color: C.text, fontFamily: fonts.body, fontSize: 16 };
const labelStyle = { ...type.body, fontWeight: 700, display: 'block', marginBottom: 6 };
const field = { marginTop: 16 };

// Both Settings and the recipe edit the same profile preferences. A single
// explicit save makes partial equipment knowledge useful without changing the
// user's default brew method or their ordinary grinder.
export function EspressoEquipmentEditor({ onSaved, onCancel }) {
  const { preferences, updatePreferences } = usePreferences();
  const [draft, setDraft] = useState(() => ({
    espressoMachine: preferences.espressoMachine || 'unknown',
    espressoMachineName: preferences.espressoMachineName || '',
    espressoBasket: preferences.espressoBasket || 'unknown',
    espressoBasketDoseGrams: preferences.espressoBasketDoseGrams ?? '',
    espressoGrinder: preferences.espressoGrinder || 'unknown',
    espressoGrinderModel: preferences.espressoGrinderModel || '',
    espressoGrinderCustomName: preferences.espressoGrinderCustomName || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key, value) => {
    setError(null);
    setDraft(old => ({ ...old, [key]: value,
      ...(key === 'espressoBasket' && value === 'stock-double-single-wall' ? { espressoBasketDoseGrams: '' } : {}),
      ...(key === 'espressoMachine' && value !== 'breville-barista-express'
        ? { espressoBasket: old.espressoBasket === 'stock-double-single-wall' ? 'unknown' : old.espressoBasket } : {}),
    }));
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    const dose = draft.espressoBasketDoseGrams === '' ? null : Number(draft.espressoBasketDoseGrams);
    if (dose != null && (!Number.isFinite(dose) || dose <= 0 || Math.round(dose * 10) / 10 !== dose)) {
      setError('Enter your basket’s dose as a positive amount in grams, in steps of 0.1 g.');
      return;
    }
    const knownStock = draft.espressoMachine === 'breville-barista-express' && draft.espressoBasket === 'stock-double-single-wall';
    if (knownStock && dose != null && (dose < 16 || dose > 19)) {
      setError('The original Barista Express double basket is rated for 16–19 g. Choose a different basket if you use another size.');
      return;
    }
    const trim = value => value.trim() || null;
    const updates = {
      espressoMachine: draft.espressoMachine === 'unknown' ? null : draft.espressoMachine,
      espressoMachineName: draft.espressoMachine === 'other' ? trim(draft.espressoMachineName) : null,
      espressoBasket: draft.espressoBasket === 'unknown' ? null : draft.espressoBasket,
      espressoBasketDoseGrams: knownStock ? null : dose,
      espressoGrinder: draft.espressoGrinder === 'unknown' ? null : draft.espressoGrinder,
      espressoGrinderModel: draft.espressoGrinder === 'external' ? trim(draft.espressoGrinderModel) : null,
      espressoGrinderCustomName: draft.espressoGrinder === 'custom' ? trim(draft.espressoGrinderCustomName) : null,
      espressoSetupConfirmed: knownStock && ['integrated', 'external', 'custom'].includes(draft.espressoGrinder),
    };
    setSaving(true);
    setError(null);
    try {
      await updatePreferences(updates);
      onSaved?.(updates);
    } catch (caught) {
      setError(caught.message || 'Could not save your espresso equipment. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save}>
      <p style={{ ...type.body, color: C.textMuted, margin: 0 }}>Add your machine. The rest can wait.</p>
      <div style={field}>
        <label htmlFor="espresso-equipment-machine" style={labelStyle}>Machine</label>
        <select id="espresso-equipment-machine" aria-label="Espresso machine" value={draft.espressoMachine} onChange={e => set('espressoMachine', e.target.value)} style={fieldStyle} disabled={saving}>
          {ESPRESSO_MACHINES.map(item => <option key={item.key} value={item.key}>{item.key === 'unknown' ? 'Not added yet' : item.label}</option>)}
        </select>
      </div>
      {draft.espressoMachine === 'other' && <div style={field}>
        <label htmlFor="espresso-equipment-name" style={labelStyle}>Machine name <span style={{ color: C.textMuted, fontWeight: 400 }}>· optional</span></label>
        <input id="espresso-equipment-name" aria-label="Espresso machine name" maxLength={80} placeholder="e.g. Gaggia Classic" value={draft.espressoMachineName} onChange={e => set('espressoMachineName', e.target.value)} style={fieldStyle} disabled={saving} />
      </div>}
      <details style={{ marginTop: 12 }} open={draft.espressoBasket !== 'unknown' || draft.espressoGrinder !== 'unknown' ? true : undefined}>
        <summary style={{ ...type.body, color: C.accent, fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Basket &amp; grinder <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>· optional</span></summary>
        <div style={field}>
          <label htmlFor="espresso-equipment-basket" style={labelStyle}>Which basket are you using?</label>
          <select id="espresso-equipment-basket" aria-label="Espresso basket" value={draft.espressoBasket} onChange={e => set('espressoBasket', e.target.value)} style={fieldStyle} disabled={saving}>
            {ESPRESSO_BASKETS.filter(item => item.key !== 'stock-double-single-wall' || draft.espressoMachine === 'breville-barista-express').map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <p style={{ ...type.caption, color: C.textMuted, lineHeight: 1.5, margin: '8px 0 0' }}>Single-wall is for freshly ground coffee; dual-wall is often used with pre-ground. Not sure? Leave it for later.</p>
        </div>
        {['different', 'dual-wall'].includes(draft.espressoBasket) && <div style={field}>
          <label htmlFor="espresso-equipment-dose" style={labelStyle}>Your usual basket dose (g) <span style={{ color: C.textMuted, fontWeight: 400 }}>· optional</span></label>
          <input id="espresso-equipment-dose" aria-label="Espresso basket dose" inputMode="decimal" type="number" min="0.1" step="0.1" placeholder="From your basket or roaster" value={draft.espressoBasketDoseGrams} onChange={e => set('espressoBasketDoseGrams', e.target.value)} style={fieldStyle} disabled={saving} />
        </div>}
        <div style={field}>
          <label htmlFor="espresso-equipment-grinder" style={labelStyle}>Grinder</label>
          <select id="espresso-equipment-grinder" aria-label="Espresso grinder" value={draft.espressoGrinder} onChange={e => set('espressoGrinder', e.target.value)} style={fieldStyle} disabled={saving}>
            {ESPRESSO_GRINDERS.map(item => <option key={item.key} value={item.key}>{item.key === 'integrated' && draft.espressoMachine !== 'breville-barista-express' ? 'Built into my machine' : item.label}</option>)}
          </select>
        </div>
        {['external', 'custom'].includes(draft.espressoGrinder) && <div style={field}>
          <label htmlFor="espresso-equipment-grinder-name" style={labelStyle}>Grinder name <span style={{ color: C.textMuted, fontWeight: 400 }}>· optional</span></label>
          <input id="espresso-equipment-grinder-name" aria-label="External espresso grinder model" value={draft.espressoGrinder === 'external' ? draft.espressoGrinderModel : draft.espressoGrinderCustomName} onChange={e => set(draft.espressoGrinder === 'external' ? 'espressoGrinderModel' : 'espressoGrinderCustomName', e.target.value)} maxLength={80} placeholder="e.g. DF64" style={fieldStyle} disabled={saving} />
        </div>}
      </details>
      {error && <p role="alert" style={{ ...type.body, color: C.red, marginTop: 14 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Btn type="submit" disabled={saving} style={{ minHeight: 48, flex: 1 }}>{saving ? 'Saving…' : 'Save equipment'}</Btn>
        <Btn type="button" variant="secondary" disabled={saving} onClick={onCancel} style={{ minHeight: 48 }}>Cancel</Btn>
      </div>
      <p style={{ ...type.caption, color: C.textMuted, marginTop: 10 }}>Your default brew method stays {preferences.brewMethod === 'aiden' ? 'Aiden' : 'the same'}.</p>
    </form>
  );
}
