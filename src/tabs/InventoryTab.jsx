// Inventory tab — ported from prototype lines 438-481
import { useState, useEffect } from 'react';
import { Plus, Search, Coffee, Check } from 'lucide-react';
import { BrewButton } from '../components/BrewButton';
import { C, fonts, type, shadows, radius, glass, journalCard } from '../styles/theme';
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
import { m, listContainer, listItem, fadeUp } from '../lib/motion';

export const InventoryTab = ({ uid, beans, tastings, onOpenBean, onAddBean, updateBean, deleteBean, onFinishBean, addTasting, updateTasting, getBeanById, pendingAddBeanMode, onPendingAddBeanConsumed, onStartTastingSession, isDemo, onDemoAction }) => {
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
    if (pendingAddBeanMode === 'scan') {
      setScanOpen(true);
      onPendingAddBeanConsumed?.();
    } else if (pendingAddBeanMode === 'manual_add') {
      setManualOpen(true);
      onPendingAddBeanConsumed?.();
    }
  }, [pendingAddBeanMode, onPendingAddBeanConsumed]);
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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      position: 'absolute', inset: 0,
    }}>
      {/* Fixed header — glass surface, editorial typography */}
      <div style={{
        flexShrink: 0,
        background: glass.chrome,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        borderBottom: `1px solid ${glass.chromeBorder}`,
        padding: '14px 20px 12px',
      }}>
        {/* Title row + Add Bean CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            {/* Eyebrow label */}
            <div style={{
              ...type.label,
              color: C.accent,
              marginBottom: 4,
            }}>
              Sealed Inventory
            </div>
            {/* Fraunces display title */}
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h1.fontSize,
              fontWeight: type.h1.fontWeight,
              lineHeight: type.h1.lineHeight,
              letterSpacing: type.h1.letterSpacing,
              color: C.text,
            }}>
              Patiently waiting
            </div>
          </div>
          <Btn
            variant="primary"
            onClick={() => isDemo ? onDemoAction?.() : setScanOpen(true)}
            style={{ padding: '10px 16px', minHeight: 44, marginTop: 2 }}
            data-tour="add-bean"
          >
            <Plus size={15} /> Add Bean
          </Btn>
        </div>

        {/* Stats row — inline pills with dot separators */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}>
          {/* In peak stat */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: C.greenBg,
            borderRadius: radius.pill,
            padding: '3px 10px 3px 7px',
            border: `1px solid rgba(92,138,102,0.18)`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.green, lineHeight: 1 }}>
              {peakCount}
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.green, lineHeight: 1, opacity: 0.85 }}>
              in peak
            </span>
          </div>

          <span style={{ color: C.textLight, fontSize: 11, margin: '0 8px', lineHeight: 1 }}>&middot;</span>

          {/* Bags waiting */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.text }}>{sealed.length}</span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.textMuted }}>bags waiting</span>
          </div>

          <span style={{ color: C.textLight, fontSize: 11, margin: '0 8px', lineHeight: 1 }}>&middot;</span>

          {/* Empty slots */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.text }}>{emptySlots.length}</span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.textMuted }}>
              empty slot{emptySlots.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search field — premium glass input */}
        {sealed.length > 5 && (
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.textMuted,
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search beans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 40px',
                borderRadius: radius.md,
                border: `1px solid ${C.hairline}`,
                fontFamily: fonts.body,
                fontSize: 16,
                fontWeight: 500,
                background: C.cream,
                color: C.text,
                boxSizing: 'border-box',
                outline: 'none',
                boxShadow: shadows.e1,
                minHeight: 44,
                WebkitAppearance: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* Scrollable cards area */}
      <div
        data-tour="sealed-beans"
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: `12px 20px calc(100px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {/* Roaster groups with stagger animation */}
        <m.div
          variants={listContainer}
          initial="initial"
          animate="animate"
        >
          {Object.entries(grouped).map(([roaster, rBeans]) => (
            <m.div key={roaster} variants={listItem} style={{ marginBottom: 24 }}>
              {/* Roaster group header — eyebrow label style */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}>
                {/* Roaster name — eyebrow label */}
                <div style={{
                  ...type.label,
                  color: C.textMuted,
                  flexShrink: 0,
                }}>
                  {roaster}
                </div>
                {/* Hairline rule */}
                <div style={{
                  flex: 1,
                  height: 1,
                  background: C.hairline,
                  marginTop: 1,
                }} />
                {/* Bag count — refined caption */}
                <div style={{
                  fontFamily: fonts.body,
                  fontSize: type.caption.fontSize,
                  fontWeight: type.caption.fontWeight,
                  color: C.textLight,
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}>
                  {rBeans.length} {rBeans.length !== 1 ? 'bags' : 'bag'}
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
            </m.div>
          ))}
        </m.div>

        {/* Empty state — warm, inviting */}
        {sealed.length === 0 && (
          <m.div
            {...fadeUp}
            style={{ textAlign: 'center', padding: '40px 20px 24px' }}
          >
            <video
              src="/images/ruphus-animations/ruphus-empty-cup.mp4"
              autoPlay muted loop playsInline
              style={{
                width: 200, height: 200, objectFit: 'contain', margin: '0 auto 16px',
                display: 'block',
                WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
                maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              }}
            />
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h2.fontSize,
              fontWeight: type.h2.fontWeight,
              lineHeight: type.h2.lineHeight,
              color: C.text,
              marginBottom: 8,
            }}>
              The stash is empty
            </div>
            <div style={{
              fontFamily: fonts.body,
              fontSize: type.body.fontSize,
              fontWeight: type.body.fontWeight,
              lineHeight: type.body.lineHeight,
              color: C.textMuted,
              maxWidth: 240,
              margin: '0 auto 20px',
            }}>
              Add your sealed bags and track every bean before it hits peak.
            </div>
            <Btn
              variant="primary"
              onClick={() => isDemo ? onDemoAction?.() : setScanOpen(true)}
              style={{ minHeight: 44, padding: '10px 20px' }}
            >
              <Plus size={15} /> Add Bean
            </Btn>
          </m.div>
        )}

        {/* No search results */}
        {sealed.length > 0 && filtered.length === 0 && (
          <m.div
            {...fadeUp}
            style={{
              textAlign: 'center',
              color: C.textMuted,
              fontFamily: fonts.body,
              fontSize: type.body.fontSize,
              padding: '48px 20px',
            }}
          >
            No beans match &ldquo;{search}&rdquo;
          </m.div>
        )}
      </div>

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onBeanCreated={handleBeanCreated}
        onManualEntry={() => { setScanOpen(false); setManualOpen(true); }}
        uid={uid}
        addBean={onAddBean}
        updateBean={updateBean}
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
