// Inventory tab — ported from prototype lines 438-481
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { BeanCard } from '../components/BeanCard';
import { Btn } from '../components/Btn';
import { AddBeanForm } from '../components/AddBeanForm';

export const InventoryTab = ({ beans, onOpenBean, onAddBean }) => {
  const sealed = beans.filter(b => b.status === 'SEALED');
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));
  const [showAdd, setShowAdd] = useState(false);

  // Group by roaster
  const grouped = {};
  sealed.forEach(b => {
    (grouped[b.roaster] = grouped[b.roaster] || []).push(b);
  });

  // Sort within groups by peak status priority
  Object.keys(grouped).forEach(k => {
    grouped[k].sort((a, b) => {
      const pa = getPeakStatus(a);
      const pb = getPeakStatus(b);
      const order = { 'Past Peak': 0, 'Fading': 0, 'Stale': 0, 'In Peak': 1, 'Resting': 2, 'Degassing': 3, 'Unknown': 4 };
      const catA = pa.label.startsWith('In Peak') ? 'In Peak' : pa.label.split(' (')[0].split(' +')[0];
      const catB = pb.label.startsWith('In Peak') ? 'In Peak' : pb.label.split(' (')[0].split(' +')[0];
      return (order[catA] ?? 4) - (order[catB] ?? 4);
    });
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontFamily: fonts.title, fontSize: 26, color: C.text }}>Sealed Inventory</div>
        <Btn variant="primary" onClick={() => setShowAdd(true)} style={{ padding: '8px 14px' }}>
          <Plus size={14} /> Add Bean
        </Btn>
      </div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
        {sealed.length} bags waiting · {emptySlots.length} empty slot{emptySlots.length !== 1 ? 's' : ''}
      </div>

      {Object.entries(grouped).map(([roaster, rBeans]) => (
        <div key={roaster} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accentLight, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            {roaster}
          </div>
          {rBeans.map(bean => (
            <BeanCard
              key={bean.id}
              bean={bean}
              compact
              actions={
                emptySlots.length > 0
                  ? <Btn variant="small" onClick={() => onOpenBean(bean.id, emptySlots[0])}><Plus size={12} /> Open</Btn>
                  : null
              }
            />
          ))}
        </div>
      ))}

      {sealed.length === 0 && (
        <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
          No sealed beans. Time to order!
        </div>
      )}

      <AddBeanForm open={showAdd} onClose={() => setShowAdd(false)} onAdd={onAddBean} />
    </div>
  );
};
