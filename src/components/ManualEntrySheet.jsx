import { useState } from 'react';
import { C, fonts } from '../styles/theme';
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
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Bean Manually"
      footer={
        <Btn variant="primary" onClick={handleAdd} disabled={!canAdd || saving}
          style={{ width: '100%' }}>
          {saving ? 'Adding...' : 'Add Bean'}
        </Btn>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' }}>
            Roaster *
          </label>
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
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' }}>
            Bean Name *
          </label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="e.g. Tropical Weather"
          />
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          You can fill in all other details after adding.
        </div>
      </div>
    </Modal>
  );
};
