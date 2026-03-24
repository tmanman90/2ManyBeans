// Open Bean Modal — ported from prototype lines 1153-1191
import { useState, useEffect } from 'react';
import { Check, Search } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Btn } from './Btn';

export const OpenBeanFlow = ({ open, onClose, beans, onOpenBean, targetSlot }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const sealed = beans.filter(b => b.status === 'SEALED');
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));

  useEffect(() => {
    if (!open) { setSearch(''); setSelectedId(null); }
  }, [open]);

  const matchesSearch = (bean, q) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return [bean.name, bean.roaster, bean.origin, bean.variety, bean.process,
      bean.bagNotes, bean.producer, bean.region, bean.farm, bean.roastLevel, bean.sourcedBy]
      .some(v => v && v.toLowerCase().includes(lq));
  };

  const filtered = sealed.filter(b => matchesSearch(b, search));

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
      {sealed.length > 5 && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
          <input
            type="text"
            placeholder="Search beans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
              border: `1px solid ${C.border}`, fontFamily: fonts.body,
              fontSize: 14, background: C.cream, color: C.text,
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
      )}
      {filtered.map(bean => {
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
