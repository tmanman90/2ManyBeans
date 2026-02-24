// Edit Bean Modal — edit any bean field + grind settings
import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';

export const EditBeanModal = ({ open, onClose, bean, updateBean }) => {
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bean && open) {
      setF({
        roaster: bean.roaster || '',
        name: bean.name || '',
        origin: bean.origin || '',
        variety: bean.variety || '',
        process: bean.process || 'Washed',
        bagSize: bean.bagSize || 100,
        roastDate: bean.roastDate || '',
        producer: bean.producer || '',
        bagNotes: bean.bagNotes || '',
        ssGrind: bean.aidenGrind?.singleServe ?? '',
        batchGrind: bean.aidenGrind?.batch ?? '',
      });
    }
  }, [bean, open]);

  if (!bean) return null;

  const handleSave = async () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    setSaving(true);

    const changes = {};
    if (f.roaster.trim() !== (bean.roaster || '')) changes.roaster = f.roaster.trim();
    if (f.name.trim() !== (bean.name || '')) changes.name = f.name.trim();
    if (f.origin.trim() !== (bean.origin || '')) changes.origin = f.origin.trim();
    if (f.variety.trim() !== (bean.variety || '')) changes.variety = f.variety.trim();
    if (f.process !== (bean.process || 'Washed')) changes.process = f.process;
    if (Number(f.bagSize) !== (bean.bagSize || 100)) changes.bagSize = Number(f.bagSize) || 100;
    if (f.roastDate !== (bean.roastDate || '')) changes.roastDate = f.roastDate;
    if (f.producer.trim() !== (bean.producer || '')) changes.producer = f.producer.trim();
    if (f.bagNotes.trim() !== (bean.bagNotes || '')) changes.bagNotes = f.bagNotes.trim();

    // Grind handling
    const ss = f.ssGrind !== '' ? Number(f.ssGrind) : null;
    const batch = f.batchGrind !== '' ? Number(f.batchGrind) : null;
    const oldSs = bean.aidenGrind?.singleServe ?? null;
    const oldBatch = bean.aidenGrind?.batch ?? null;

    if (ss !== oldSs || batch !== oldBatch) {
      if (ss !== null || batch !== null) {
        changes.aidenGrind = { singleServe: ss, batch };
      } else {
        changes.aidenGrind = null;
      }
    }

    if (Object.keys(changes).length > 0) {
      await updateBean(bean.id, changes);
    }

    setSaving(false);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 14, background: C.bg, color: C.text, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' };
  const rowStyle = { marginBottom: 12 };

  return (
    <Modal open={open} onClose={onClose} title="Edit Bean">
      <div style={rowStyle}>
        <label style={labelStyle}>Roaster *</label>
        <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} style={inputStyle} />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Coffee Name *</label>
        <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div>
          <label style={labelStyle}>Origin</label>
          <input value={f.origin} onChange={e => setF(p => ({ ...p, origin: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Variety</label>
          <input value={f.variety} onChange={e => setF(p => ({ ...p, variety: e.target.value }))} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div>
          <label style={labelStyle}>Process</label>
          <select value={f.process} onChange={e => setF(p => ({ ...p, process: e.target.value }))} style={inputStyle}>
            {['Washed', 'Natural', 'Anaerobic Honey', 'Anaerobic Natural', 'White Honey', 'Advanced Natural', 'Honey', 'Other'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Bag Size (g)</label>
          <input value={f.bagSize} onChange={e => setF(p => ({ ...p, bagSize: e.target.value }))} type="number" min={1} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div>
          <label style={labelStyle}>Roast Date</label>
          <input value={f.roastDate} onChange={e => setF(p => ({ ...p, roastDate: e.target.value }))} type="date" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Producer</label>
          <input value={f.producer} onChange={e => setF(p => ({ ...p, producer: e.target.value }))} placeholder="Optional" style={inputStyle} />
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Tasting Notes</label>
        <input value={f.bagNotes} onChange={e => setF(p => ({ ...p, bagNotes: e.target.value }))} placeholder="e.g. peach / floral / citrus" style={inputStyle} />
      </div>

      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, ...rowStyle }}>
        <label style={{ ...labelStyle, fontSize: 13, color: C.accent }}>Grind Settings (Ode Gen 2)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>SS Grind</label>
            <input
              value={f.ssGrind}
              onChange={e => setF(p => ({ ...p, ssGrind: e.target.value }))}
              type="number"
              step={0.1}
              min={0}
              placeholder="e.g. 4.0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Batch Grind</label>
            <input
              value={f.batchGrind}
              onChange={e => setF(p => ({ ...p, batchGrind: e.target.value }))}
              type="number"
              step={0.1}
              min={0}
              placeholder="e.g. 6.2"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          onClick={handleSave}
          disabled={saving || !f.roaster?.trim() || !f.name?.trim()}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
        </Btn>
      </div>
    </Modal>
  );
};
