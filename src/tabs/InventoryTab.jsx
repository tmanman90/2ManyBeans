// Inventory tab — ported from prototype lines 438-481
import { useState, useEffect } from 'react';
import { Plus, Search, Coffee, Check } from 'lucide-react';
import { BrewButton } from '../components/BrewButton';
import { C, fonts, journalCard } from '../styles/theme';
import { getPeakStatus } from '../lib/peakStatus';
import { BeanCard } from '../components/BeanCard';
import { Btn } from '../components/Btn';
import { ScanSheet } from '../components/ScanSheet';
import { ManualEntrySheet } from '../components/ManualEntrySheet';
import { EditBeanModal } from '../components/EditBeanModal';
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

export const InventoryTab = ({ uid, beans, tastings, onOpenBean, onAddBean, updateBean, deleteBean, onFinishBean, addTasting, updateTasting, getBeanById, pendingAddBean, onPendingAddBeanConsumed, onStartTastingSession, isDemo, onDemoAction }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const isHandBrew = preferences.brewMethod !== 'aiden';
  const canisterCount = preferences.canisterCount || 3;
  const sealed = beans.filter(b => b.status === 'SEALED');
  const slotNumbers = Array.from({ length: canisterCount }, (_, i) => i + 1);
  const emptySlots = slotNumbers.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.jarSlot === n));
  const peakCount = sealed.filter(b => getPeakStatus(b).label.startsWith('In Peak')).length;
  const [scanOpen, setScanOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [newBeanEntry, setNewBeanEntry] = useState(null);
  const liveNewBean = newBeanEntry ? beans.find(b => b.id === newBeanEntry.id) : null;
  const newBeanForModal = newBeanEntry
    ? { ...newBeanEntry, ...(liveNewBean || {}), _scanPhotos: newBeanEntry._scanPhotos }
    : null;

  const handleBeanCreated = (beanId, beanData) => {
    setScanOpen(false);
    setManualOpen(false);
    setNewBeanEntry(beanData);
  };

  useEffect(() => {
    if (pendingAddBean) {
      setScanOpen(true);
      onPendingAddBeanConsumed?.();
    }
  }, [pendingAddBean, onPendingAddBeanConsumed]);
  const [search, setSearch] = useState('');
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [toast, setToast] = useState(null);
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings, getBeanById);
  const aiden = useAidenBrew(updateBean);
  const handBrew = useHandBrew(updateBean);
  const [brewMenuBean, setBrewMenuBean] = useState(null);

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
    width: 56, height: 3, background: C.accentLight, borderRadius: 2, margin: '10px 0 12px',
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      position: 'absolute', inset: 0,
    }}>
      {/* Fixed header: title, add button, search (non-scrolling) */}
      <div style={{
        flexShrink: 0, background: C.bg,
        padding: '12px 20px 8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
          <div>
            <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text, lineHeight: 1 }}>Sealed Inventory</div>
            <div style={{ fontFamily: fonts.title, fontSize: 16, color: C.accent, marginTop: -2, opacity: 0.8 }}>
              patiently waiting
            </div>
          </div>
          <Btn variant="primary" onClick={() => isDemo ? onDemoAction?.() : setScanOpen(true)} style={{ padding: '8px 14px' }} data-tour="add-bean">
            <Plus size={14} /> Add Bean
          </Btn>
        </div>
        <div style={accentBar} />
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
            <strong style={{ color: C.text, fontWeight: 700 }}>{peakCount}</strong> in peak
          </span>
          <span style={{ color: C.textLight }}>{'\u00B7'}</span>
          <span>{sealed.length} bags waiting</span>
          <span style={{ color: C.textLight }}>{'\u00B7'}</span>
          <span>{emptySlots.length} empty slot{emptySlots.length !== 1 ? 's' : ''}</span>
        </div>

        {sealed.length > 5 && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted }} />
            <input
              type="text"
              placeholder="Search beans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '9px 10px 9px 32px', borderRadius: 10,
                border: `1px solid ${C.border}`, fontFamily: fonts.body,
                fontSize: 16, background: C.cream, color: C.text,
                boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* Scrollable cards area */}
      <div data-tour="sealed-beans" style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: `0 20px calc(100px + env(safe-area-inset-bottom, 0px))`,
      }}>
        {Object.entries(grouped).map(([roaster, rBeans]) => (
          <div key={roaster} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <path d="M12 22V7" stroke={C.green} strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M12 13c-3 0-5-2-5-4 2 0 5 1 5 4z" fill={C.green} opacity="0.75"/>
                <path d="M12 10c3 0 5-2 5-4-2 0-5 1-5 4z" fill={C.green} opacity="0.9"/>
              </svg>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {roaster}
              </div>
              <div style={{ flex: 1, borderBottom: `1px dotted ${C.accentLight}`, marginLeft: 2, marginBottom: 2 }} />
              <div style={{ fontSize: 11, color: C.textLight }}>
                {rBeans.length} bag{rBeans.length !== 1 ? 's' : ''}
              </div>
            </div>
            {rBeans.map(bean => (
              <BeanCard
                key={bean.id}
                bean={bean}
                compact
                updateBean={updateBean}
                deleteBean={deleteBean}
                onLearn={isDemo ? onDemoAction : handleLearn}
                uid={uid}
                actions={
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 16px' }}>
                    {emptySlots.length > 0 && (
                      <Btn variant="small" onClick={() => onOpenBean(bean.id, emptySlots[0])}><Plus size={12} /> Open</Btn>
                    )}
                    <BrewButton
                      bean={bean}
                      label={brewMethod.label}
                      isHandBrew={isHandBrew}
                      brewMenuBean={brewMenuBean}
                      setBrewMenuBean={setBrewMenuBean}
                      onAiden={isDemo ? onDemoAction : aiden.handleBrewWithAiden}
                      onHandBrew={isDemo ? onDemoAction : handBrew.handleBrewHandBrew}
                    />
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
          <div style={{ textAlign: 'center', padding: '24px 20px' }}>
            <video
              src="/images/ruphus-animations/ruphus-empty-cup.mp4"
              autoPlay muted loop playsInline
              style={{
                width: 200, height: 200, objectFit: 'contain', margin: '0 auto 8px',
                display: 'block',
                WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
                maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              }}
            />
            <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 6 }}>No sealed beans</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Add your stash to keep track</div>
          </div>
        )}
        {sealed.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>
            No beans match "{search}"
          </div>
        )}
      </div>

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onBeanCreated={handleBeanCreated}
        onManualEntry={() => { setScanOpen(false); setManualOpen(true); }}
        uid={uid}
        addBean={onAddBean}
      />
      <ManualEntrySheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onBeanCreated={handleBeanCreated}
        addBean={onAddBean}
      />
      {newBeanEntry && (
        <EditBeanModal
          open={!!newBeanEntry}
          onClose={() => setNewBeanEntry(null)}
          bean={newBeanForModal}
          updateBean={updateBean}
          deleteBean={deleteBean}
          isNewBean
          uid={uid}
        />
      )}
      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        bean={aiden.aidenBean}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
        onRegenerate={aiden.onRegenerate}
        onPushCached={aiden.onPushCached}
        icedResult={aiden.icedResult}
        icedLoading={aiden.icedLoading}
        icedError={aiden.icedError}
        onPushIced={aiden.onPushIced}
        onRetryIcedPush={aiden.onRetryIcedPush}
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
        bean={handBrew.handBrewBean}
        onStartTasting={onStartTastingSession}
        userCoffeeGrams={handBrew.userCoffeeGrams}
        onCoffeeGramsChange={handBrew.setUserCoffeeGrams}
        onPersistDose={handBrew.persistDose}
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
