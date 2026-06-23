import { useState } from 'react';
import { C, fonts, type, shadows, radius } from '../styles/theme';
import { buildNewBeanData } from '../lib/beanBuilder';
import { scrollOnFocus } from '../lib/formHelpers';
import { Modal } from './Modal';
import { Btn } from './Btn';

export const ManualEntrySheet = ({ open, onClose, onBeanCreated, addBean }) => {
  const [roaster, setRoaster] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setRoaster('');
    setName('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = async () => {
    if (!roaster.trim() || !name.trim() || saving) return;
    setSaving(true);
    try {
      const beanData = buildNewBeanData({ roaster, name });
      const beanId = await addBean(beanData);
      const entry = { id: beanId, ...beanData };
      reset();
      onBeanCreated(beanId, entry);
    } catch {
      setSaving(false);
    }
  };

  const canAdd = roaster.trim() && name.trim();

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: radius.md,
    border: `1px solid ${C.hairline}`, fontFamily: fonts.body,
    fontSize: 16, background: C.cream, color: C.text, boxSizing: 'border-box',
    outline: 'none', boxShadow: shadows.e1,
  };

  const labelStyle = {
    ...type.label, color: C.textMuted,
    marginBottom: 7, display: 'block',
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Bean Manually"
      footer={
        <Btn variant="primary" onClick={handleAdd} disabled={!canAdd || saving}
          style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Adding...' : 'Add Bean'}
        </Btn>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 8 }}>
        <div>
          <label style={labelStyle}>Roaster *</label>
          <input
            style={inputStyle}
            value={roaster}
            onChange={e => setRoaster(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="e.g. Onyx Coffee Lab"
            autoFocus
          />
        </div>
        <div>
          <label style={labelStyle}>Bean Name *</label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="e.g. Tropical Weather"
          />
        </div>
        <div style={{
          padding: '10px 14px', borderRadius: radius.md,
          background: C.bgDeep, border: `1px solid ${C.borderLight}`,
        }}>
          <div style={{ ...type.caption, color: C.textMuted }}>
            You can fill in origin, process, roast date, and tasting notes after adding.
          </div>
        </div>
      </div>
    </Modal>
  );
};
