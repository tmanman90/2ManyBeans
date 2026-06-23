// Open Bean Modal — ported from prototype lines 1153-1191
import { useState, useEffect } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Btn } from './Btn';

export const OpenBeanFlow = ({ open, onClose, beans, onOpenBean, onAddNewBean, targetSlot, canisterCount = 3 }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const sealed = beans.filter(b => b.status === 'SEALED');
  const allSlots = Array.from({ length: canisterCount }, (_, i) => i + 1);
  const emptySlots = allSlots.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.jarSlot === n));

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

  // Empty sealed inventory: short-circuit the bean picker entirely and show
  // an Add Bean CTA. Otherwise the user sees an empty list with a disabled
  // Open button and no obvious next step.
  if (open && sealed.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Add Your First Bean">
        <div style={{ textAlign: 'center', padding: '12px 4px 16px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: C.accentSoft, border: `1.5px solid ${C.accentLight}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: shadows.e2,
            fontSize: 26,
          }}>☕</div>
          <div style={{ ...type.body, color: C.textMuted, marginBottom: 20, lineHeight: 1.55 }}>
            You don't have any sealed beans yet. Add your first coffee bag to start brewing.
          </div>
          <Btn
            variant="primary"
            onClick={() => {
              onClose();
              if (onAddNewBean) onAddNewBean();
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Plus size={14} /> Add a Bean
          </Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Open a Bean">
      {/* Jar slot context */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '10px 14px', borderRadius: radius.md,
        background: C.bgDeep, border: `1px solid ${C.hairline}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: radius.sm,
          background: C.accentSoft, border: `1.5px solid ${C.accentLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          ...type.h3, color: C.accent, fontSize: 16,
        }}>
          #{targetSlot || emptySlots[0] || '?'}
        </div>
        <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.4 }}>
          Opening into Jar {targetSlot || emptySlots[0] || '?'} — tap a bean to select
        </div>
      </div>

      {sealed.length > 5 && (
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
          <input
            type="text"
            placeholder="Search beans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '11px 12px 11px 36px', borderRadius: radius.md,
              border: `1px solid ${C.hairline}`, fontFamily: fonts.body,
              fontSize: 16, background: C.cream, color: C.text,
              boxSizing: 'border-box', outline: 'none', boxShadow: shadows.e1,
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
              background: isSel ? C.accentSoft : C.cream,
              borderRadius: radius.lg,
              padding: '14px 16px',
              border: `1.5px solid ${isSel ? C.accent : C.hairline}`,
              marginBottom: 10,
              cursor: 'pointer',
              boxShadow: isSel ? shadows.e2 : shadows.e1,
              transition: `background 0.16s, border-color 0.16s, box-shadow 0.16s`,
              position: 'relative',
            }}
          >
            {isSel && (
              <div style={{
                position: 'absolute', top: 12, right: 12,
                width: 22, height: 22, borderRadius: '50%',
                background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: shadows.button,
              }}>
                <Check size={12} color="#fff" strokeWidth={3} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: isSel ? 30 : 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...type.h3, color: C.text, fontSize: 15, fontFamily: fonts.heading, marginBottom: 3 }}>
                  {bean.name}
                </div>
                <div style={{ ...type.caption, color: C.textMuted }}>
                  {[bean.roaster, bean.origin, bean.variety, bean.bagSize ? `${bean.bagSize}g` : null]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginLeft: 10 }}>
                <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
              </div>
            </div>
            {bean.bagNotes && bean.bagNotes !== '(not logged)' && (
              <div style={{ ...type.caption, color: C.accent, fontStyle: 'italic', marginTop: 7, opacity: 0.85 }}>
                {bean.bagNotes}
              </div>
            )}
          </div>
        );
      })}

      <Btn
        variant="primary"
        onClick={doOpen}
        disabled={!selectedId}
        style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
      >
        <Check size={14} /> Open Selected Bean
      </Btn>
    </Modal>
  );
};
