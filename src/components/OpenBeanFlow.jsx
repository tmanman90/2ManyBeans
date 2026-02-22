// Open Bean Modal — ported from prototype lines 1153-1191
import { useState } from 'react';
import { Check } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Btn } from './Btn';

export const OpenBeanFlow = ({ open, onClose, beans, onOpenBean, targetSlot }) => {
  const [selectedId, setSelectedId] = useState(null);
  const sealed = beans.filter(b => b.status === 'SEALED');
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));

  const doOpen = () => {
    if (!selectedId) return;
    const slot = targetSlot || emptySlots[0];
    if (!slot) return;
    onOpenBean(selectedId, slot);
    onClose();
    setSelectedId(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Open a Bean">
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
        Opening into Atmos #{targetSlot || emptySlots[0] || '?'} · Tap to select:
      </div>
      {sealed.map(bean => {
        const ps = getPeakStatus(bean);
        const isSel = selectedId === bean.id;
        return (
          <div
            key={bean.id}
            onClick={() => setSelectedId(bean.id)}
            style={{
              background: isSel ? C.amberBg : C.card,
              borderRadius: 12,
              padding: 14,
              border: `2px solid ${isSel ? C.amber : C.border}`,
              marginBottom: 8,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: fonts.title, fontSize: 15, color: C.text }}>{bean.name}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  {bean.roaster} · {bean.origin} · {bean.variety} · {bean.bagSize || '?'}g
                </div>
              </div>
              <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
            </div>
            {bean.bagNotes && bean.bagNotes !== '(not logged)' && (
              <div style={{ fontSize: 11, color: C.accentLight, fontStyle: 'italic', marginTop: 4 }}>
                ☕ {bean.bagNotes}
              </div>
            )}
          </div>
        );
      })}
      <Btn
        variant="primary"
        onClick={doOpen}
        disabled={!selectedId}
        style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
      >
        <Check size={14} /> Open Selected Bean
      </Btn>
    </Modal>
  );
};
