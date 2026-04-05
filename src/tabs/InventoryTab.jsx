// Inventory tab — ported from prototype lines 438-481
import { useState } from 'react';
import { Plus, Search, Coffee, Check } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { BeanCard } from '../components/BeanCard';
import { Btn } from '../components/Btn';
import { AddBeanForm } from '../components/AddBeanForm';
import { AidenModal } from '../components/AidenModal';
import { HandBrewModal } from '../components/HandBrewModal';
import { FinishBagPrompt } from '../components/FinishBagPrompt';
import { Toast } from '../components/Toast';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';

export const InventoryTab = ({ uid, beans, tastings, onOpenBean, onAddBean, updateBean, onFinishBean, addTasting, updateTasting }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const isHandBrew = preferences.brewMethod === 'handbrew';
  const canisterCount = preferences.canisterCount || 3;
  const sealed = beans.filter(b => b.status === 'SEALED');
  const slotNumbers = Array.from({ length: canisterCount }, (_, i) => i + 1);
  const emptySlots = slotNumbers.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [toast, setToast] = useState(null);
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings);
  const aiden = useAidenBrew(updateBean);
  const handBrew = useHandBrew(updateBean);

  const handleFinishBag = (bean) => {
    const hasTasting = tastings.some(t => t.beanId === bean.id);
    if (hasTasting) {
      onFinishBean(bean.id);
      setToast(`${bean.name} finished!`);
    } else {
      setFinishPrompt(bean);
    }
  };

  const matchesSearch = (bean, q) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return [bean.name, bean.roaster, bean.origin, bean.variety, bean.process,
      bean.bagNotes, bean.producer, bean.region, bean.farm, bean.roastLevel, bean.sourcedBy]
      .some(v => v && v.toLowerCase().includes(lq));
  };

  const filtered = sealed.filter(b => matchesSearch(b, search));

  // Group by roaster
  const grouped = {};
  filtered.forEach(b => {
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

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text }}>Sealed Inventory</div>
        <Btn variant="primary" onClick={() => setShowAdd(true)} style={{ padding: '8px 14px' }}>
          <Plus size={14} /> Add Bean
        </Btn>
      </div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
        {sealed.length} bags waiting · {emptySlots.length} empty slot{emptySlots.length !== 1 ? 's' : ''}
      </div>

      {sealed.length > 5 && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
          <input
            type="text"
            placeholder="Search beans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
              border: `1px solid ${C.border}`, fontFamily: fonts.body,
              fontSize: 16, background: C.cream, color: C.text,
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
      )}

      {Object.entries(grouped).map(([roaster, rBeans]) => (
        <div key={roaster} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            {roaster}
          </div>
          {rBeans.map(bean => (
            <BeanCard
              key={bean.id}
              bean={bean}
              compact
              updateBean={updateBean}
              onLearn={handleLearn}
              uid={uid}
              actions={
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {emptySlots.length > 0 && (
                    <Btn variant="small" onClick={() => onOpenBean(bean.id, emptySlots[0])}><Plus size={12} /> Open</Btn>
                  )}
                  <Btn variant="small" onClick={() => isHandBrew ? handBrew.handleBrewHandBrew(bean) : aiden.handleBrewWithAiden(bean)} aria-label={brewMethod.label}>
                    <Coffee size={12} /> {brewMethod.label}
                  </Btn>
                  <Btn variant="small" onClick={() => handleFinishBag(bean)}>
                    <Check size={12} /> Finish
                  </Btn>
                </div>
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
      {sealed.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
          No beans match "{search}"
        </div>
      )}

      <AddBeanForm open={showAdd} onClose={() => setShowAdd(false)} onAdd={onAddBean} uid={uid} updateBean={updateBean} />
      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
      />
      <HandBrewModal
        open={handBrew.handBrewModal}
        onClose={handBrew.closeHandBrewModal}
        recipe={handBrew.handBrewRecipe}
        loading={handBrew.handBrewLoading}
        error={handBrew.handBrewError}
        phase={handBrew.handBrewPhase}
        onRetry={handBrew.onRetry}
        onRegenerate={handBrew.onRegenerate}
      />
      <FinishBagPrompt
        open={!!finishPrompt}
        onClose={(msg) => { setFinishPrompt(null); if (msg) setToast(msg); }}
        bean={finishPrompt}
        onFinish={onFinishBean}
        onAddTasting={addTasting}
        onUpdateTasting={updateTasting}
        beans={beans}
      />
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
      <ProfessorRuphusSlideUp {...ruphusProps} />
    </div>
  );
};
